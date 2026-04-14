import "dotenv/config";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { sanitizeProductImageUrl } from "../src/lib/product-image";

type RestaurantRef = {
  slug: string;
  name: string;
  id: string;
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

const sourceProductInclude = {
  category: true,
  optionGroups: {
    include: {
      options: true,
    },
    orderBy: {
      id: "asc",
    },
  },
} satisfies Prisma.ProductInclude;

type SourceProduct = Prisma.ProductGetPayload<{
  include: typeof sourceProductInclude;
}>;

function parseArgs() {
  const args = process.argv.slice(2);
  let target = "";
  let sources = "";
  let replaceExisting = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target") {
      target = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--sources") {
      sources = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--replace-existing") {
      replaceExisting = true;
    }
  }

  const sourceSlugs = sources
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!target.trim() || sourceSlugs.length === 0) {
    throw new Error(
      "Usage: npm run db:menu:clone -- --target <target-slug> --sources <source-a,source-b> [--replace-existing]"
    );
  }

  return {
    targetSlug: target.trim().toLowerCase(),
    sourceSlugs,
    replaceExisting,
  };
}

async function getRestaurantBySlug(slug: string): Promise<RestaurantRef> {
  const restaurants = await prisma.restaurant.findMany({
    where: { slug },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (restaurants.length === 0) {
    throw new Error(`Restaurant with slug "${slug}" not found.`);
  }

  if (restaurants.length > 1) {
    throw new Error(
      `Restaurant slug "${slug}" is ambiguous. Narrow the selection before cloning.`
    );
  }

  return restaurants[0];
}

function toNullableJsonInput(value: Prisma.JsonValue | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

async function main() {
  const { targetSlug, sourceSlugs, replaceExisting } = parseArgs();

  const targetRestaurant = await getRestaurantBySlug(targetSlug);
  const sourceRestaurants = await Promise.all(
    sourceSlugs.map((slug) => getRestaurantBySlug(slug))
  );

  const sourceCategories = await prisma.category.findMany({
    where: {
      restaurantId: {
        in: sourceRestaurants.map((restaurant) => restaurant.id),
      },
    },
    orderBy: [
      { restaurantId: "asc" },
      { sortOrder: "asc" },
      { id: "asc" },
    ],
  });

  const sourceProducts = await prisma.product.findMany({
    where: {
      restaurantId: {
        in: sourceRestaurants.map((restaurant) => restaurant.id),
      },
    },
    include: sourceProductInclude,
    orderBy: [
      { restaurantId: "asc" },
      { categoryId: "asc" },
      { sortOrder: "asc" },
      { id: "asc" },
    ],
  });

  const categoryOrderMap = new Map<string, number>();
  const sourceCategoryById = new Map(sourceCategories.map((category) => [category.id, category]));
  const categoryKeyToId = new Map<string, string>();
  const nextSortOrderByCategoryKey = new Map<string, number>();
  let nextCategorySortOrder = 0;

  await prisma.$transaction(async (tx) => {
    if (replaceExisting) {
      await tx.product.deleteMany({
        where: { restaurantId: targetRestaurant.id },
      });
      await tx.category.deleteMany({
        where: { restaurantId: targetRestaurant.id },
      });
    }

    const existingCategories = await tx.category.findMany({
      where: { restaurantId: targetRestaurant.id },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        sortOrder: true,
      },
    });

    for (const category of existingCategories) {
      const key = category.name.trim().toLowerCase();
      categoryKeyToId.set(key, category.id);
      categoryOrderMap.set(key, category.sortOrder);
      nextCategorySortOrder = Math.max(nextCategorySortOrder, category.sortOrder + 1);
    }

    for (const category of sourceCategories) {
      const key = category.name.trim().toLowerCase();
      if (categoryKeyToId.has(key)) continue;

      const createdCategory = await tx.category.create({
        data: {
          restaurantId: targetRestaurant.id,
          name: category.name,
          active: category.active,
          sortOrder: nextCategorySortOrder,
        },
        select: {
          id: true,
          sortOrder: true,
        },
      });

      categoryKeyToId.set(key, createdCategory.id);
      categoryOrderMap.set(key, createdCategory.sortOrder);
      nextCategorySortOrder += 1;
    }

    for (const product of sourceProducts) {
      const sourceCategory = product.categoryId
        ? sourceCategoryById.get(product.categoryId) ?? null
        : null;
      const categoryKey = sourceCategory?.name.trim().toLowerCase() ?? "__uncategorized__";
      const targetCategoryId = sourceCategory
        ? (categoryKeyToId.get(categoryKey) ?? null)
        : null;
      const nextProductSortOrder = nextSortOrderByCategoryKey.get(categoryKey) ?? 0;

      await tx.product.create({
        data: {
          restaurantId: targetRestaurant.id,
          categoryId: targetCategoryId,
          name: product.name,
          nameTranslations: toNullableJsonInput(product.nameTranslations),
          description: product.description,
          price: product.price,
          imageUrl: sanitizeProductImageUrl(product.imageUrl),
          active: product.active,
          allergens: product.allergens,
          tags: product.tags,
          sortOrder: nextProductSortOrder,
          volumeLabel: product.volumeLabel,
          customerNotesConfig: toNullableJsonInput(product.customerNotesConfig),
          optionGroups: {
            create: product.optionGroups.map((group) => ({
              name: group.name,
              required: group.required,
              multiple: group.multiple,
              options: {
                create: group.options.map((option) => ({
                  name: option.name,
                  priceDelta: option.priceDelta,
                })),
              },
            })),
          },
        },
      });

      nextSortOrderByCategoryKey.set(categoryKey, nextProductSortOrder + 1);
    }
  });

  const summary = await prisma.restaurant.findUnique({
    where: { id: targetRestaurant.id },
    select: {
      id: true,
      name: true,
      slug: true,
      categories: {
        select: { id: true },
      },
      products: {
        select: { id: true },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        target: summary
          ? {
              id: summary.id,
              name: summary.name,
              slug: summary.slug,
              categories: summary.categories.length,
              products: summary.products.length,
            }
          : null,
        sources: sourceRestaurants.map((restaurant) => ({
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
        })),
        clonedProducts: sourceProducts.length,
        replaceExisting,
      },
      null,
      2
    )
  );
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
