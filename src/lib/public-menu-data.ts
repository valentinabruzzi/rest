import { unstable_cache } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DATA_CACHE_TAGS } from "@/lib/data-cache";
import { getDishRadarDynamicUnavailableIds } from "@/lib/dish-radar";
import { normalizeProductNameTranslations } from "@/lib/menu-item-name";
import { sanitizeProductImageUrl } from "@/lib/product-image";
import { normalizeProductCustomerNotesConfig } from "@/lib/product-customer-notes";
import { resolveRestaurantIdentity } from "@/lib/restaurant-resolver";
import type { MenuCategory, TableContext } from "@/types/menu";

type SerializedMenuProduct = {
  id: string;
  name: string;
  nameTranslations: ReturnType<typeof normalizeProductNameTranslations>;
  description: string;
  price: number;
  imageUrl: string | null;
  volumeLabel: string | null;
  allergens: string[];
  tags: string[];
  customerNotes: ReturnType<typeof normalizeProductCustomerNotesConfig>;
  optionGroups: Array<{
    id: string;
    name: string;
    required: boolean;
    multiple: boolean;
    options: Array<{
      id: string;
      name: string;
      priceDelta: number;
    }>;
  }>;
};

type MenuProductRecord = {
  id: string;
  name: string;
  nameTranslations: Prisma.JsonValue | null;
  description: string;
  price: number;
  imageUrl: string | null;
  volumeLabel: string | null;
  allergens: string[];
  tags: string[];
  customerNotesConfig: Prisma.JsonValue | null;
  optionGroups: Array<{
    id: string;
    name: string;
    required: boolean;
    multiple: boolean;
    options: Array<{
      id: string;
      name: string;
      priceDelta: number;
    }>;
  }>;
};

function serializeProduct(product: MenuProductRecord): SerializedMenuProduct {
  return {
    id: product.id,
    name: product.name,
    nameTranslations: normalizeProductNameTranslations(product.nameTranslations),
    description: product.description,
    price: product.price,
    imageUrl: sanitizeProductImageUrl(product.imageUrl),
    volumeLabel: product.volumeLabel,
    allergens: product.allergens,
    tags: product.tags,
    customerNotes: normalizeProductCustomerNotesConfig(product.customerNotesConfig),
    optionGroups: product.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      required: group.required,
      multiple: group.multiple,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: option.priceDelta,
      })),
    })),
  };
}

const getCachedTokenTableContext = unstable_cache(
  async (token: string): Promise<{ data: TableContext | null; error: string | null }> => {
    if (!token) {
      return {
        data: null,
        error: "Missing table or restaurant information. Open the link from your table QR code.",
      };
    }

    const table = await prisma.table.findFirst({
      where: {
        qrCodeToken: token,
        active: true,
      },
      include: {
        restaurant: true,
      },
    });

    if (!table || !table.restaurant.active) {
      return {
        data: null,
        error: "This table link is not valid or has expired.",
      };
    }

    return {
      data: {
        valid: true,
        restaurant: {
          id: table.restaurant.id,
          name: table.restaurant.name,
          slug: table.restaurant.slug,
          logoUrl: table.restaurant.logoUrl,
          primaryColor: table.restaurant.primaryColor,
          secondaryColor: table.restaurant.secondaryColor,
          currency: table.restaurant.currency,
          allowPayAtCounter: table.restaurant.allowPayAtCounter,
          serviceFeePercent: Number(table.restaurant.serviceFeePercent),
          theme: table.restaurant.theme,
          settings: table.restaurant.settings,
          openingHours: table.restaurant.openingHours,
          paymentConfig: table.restaurant.paymentConfig,
          rewardConfig: table.restaurant.rewardConfig,
        },
        table: {
          id: table.id,
          tableNumber: table.tableNumber,
        },
      },
      error: null,
    };
  },
  ["table-context-token"],
  {
    revalidate: 60,
    tags: [DATA_CACHE_TAGS.tableContext],
  }
);

const getCachedTableContextByRestaurant = unstable_cache(
  async (
    restaurantSlug: string,
    restaurantName: string,
    tableNumber: string
  ): Promise<{ data: TableContext | null; error: string | null }> => {
    if (!restaurantSlug || !tableNumber) {
      return {
        data: null,
        error: "Missing table or restaurant information. Open the link from your table QR code.",
      };
    }

    const resolvedRestaurant = await resolveRestaurantIdentity({
      slug: restaurantSlug,
      name: restaurantName,
      activeOnly: true,
    });

    if (resolvedRestaurant.status === "ambiguous") {
      return {
        data: null,
        error:
          "Questo slug appartiene a piu locali. Apri il link completo del locale corretto.",
      };
    }

    if (resolvedRestaurant.status !== "ok") {
      return {
        data: null,
        error: "We could not find this restaurant.",
      };
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: resolvedRestaurant.restaurant.id },
    });

    if (!restaurant) {
      return {
        data: null,
        error: "We could not find this restaurant.",
      };
    }

    const table = await prisma.table.findFirst({
      where: {
        restaurantId: restaurant.id,
        tableNumber,
        active: true,
      },
    });

    if (!table) {
      return {
        data: null,
        error: "This table is not recognised. Please scan the QR code on your table.",
      };
    }

    return {
      data: {
        valid: true,
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          logoUrl: restaurant.logoUrl,
          primaryColor: restaurant.primaryColor,
          secondaryColor: restaurant.secondaryColor,
          currency: restaurant.currency,
          allowPayAtCounter: restaurant.allowPayAtCounter,
          serviceFeePercent: Number(restaurant.serviceFeePercent),
          theme: restaurant.theme,
          settings: restaurant.settings,
          openingHours: restaurant.openingHours,
          paymentConfig: restaurant.paymentConfig,
          rewardConfig: restaurant.rewardConfig,
        },
        table: {
          id: table.id,
          tableNumber: table.tableNumber,
        },
      },
      error: null,
    };
  },
  ["table-context-restaurant"],
  {
    revalidate: 60,
    tags: [DATA_CACHE_TAGS.tableContext],
  }
);

const getCachedRestaurantMenuPayload = unstable_cache(
  async (
    slug: string,
    name: string
  ): Promise<{
    restaurant: TableContext["restaurant"] | null;
    categories: MenuCategory[];
    error: string | null;
  }> => {
    const resolvedRestaurant = await resolveRestaurantIdentity({
      slug,
      name,
      activeOnly: true,
    });

    if (resolvedRestaurant.status === "ambiguous") {
      return {
        restaurant: null,
        categories: [],
        error: "This slug matches more than one restaurant. Open the full link for the correct venue.",
      };
    }

    if (resolvedRestaurant.status !== "ok") {
      return {
        restaurant: null,
        categories: [],
        error: "Restaurant not found",
      };
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: resolvedRestaurant.restaurant.id },
    });

    if (!restaurant) {
      return {
        restaurant: null,
        categories: [],
        error: "Restaurant not found",
      };
    }

    const [categories, uncategorizedProducts] = await Promise.all([
      prisma.category.findMany({
        where: {
          restaurantId: restaurant.id,
          active: true,
        },
        orderBy: { sortOrder: "asc" },
        include: {
          products: {
            where: { active: true },
            orderBy: { sortOrder: "asc" },
            include: {
              optionGroups: {
                include: { options: true },
                orderBy: { name: "asc" },
              },
            },
          },
        },
      }),
      prisma.product.findMany({
        where: {
          restaurantId: restaurant.id,
          active: true,
          categoryId: null,
        },
        orderBy: { sortOrder: "asc" },
        include: {
          optionGroups: {
            include: { options: true },
            orderBy: { name: "asc" },
          },
        },
      }),
    ]);

    const dynamicallyUnavailableIds = getDishRadarDynamicUnavailableIds({
      settings: restaurant.settings,
      products: [
        ...categories.flatMap((category) =>
          category.products.map((product) => ({
            id: product.id,
            name: product.name,
            active: product.active,
          }))
        ),
        ...uncategorizedProducts.map((product) => ({
          id: product.id,
          name: product.name,
          active: product.active,
        })),
      ],
    });

    const serializedCategories: MenuCategory[] = categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        products: category.products
          .filter((product) => !dynamicallyUnavailableIds.has(product.id))
          .map((product) => serializeProduct(product)),
      }))
      .filter((category) => category.products.length > 0);

    const visibleUncategorizedProducts = uncategorizedProducts.filter(
      (product) => !dynamicallyUnavailableIds.has(product.id)
    );

    if (visibleUncategorizedProducts.length > 0) {
      serializedCategories.push({
        id: "__uncategorized__",
        name: "Senza categoria",
        sortOrder:
          (serializedCategories[serializedCategories.length - 1]?.sortOrder ?? -1) +
          1,
        products: visibleUncategorizedProducts.map((product) =>
          serializeProduct(product)
        ),
      });
    }

    return {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        logoUrl: restaurant.logoUrl,
        primaryColor: restaurant.primaryColor,
        secondaryColor: restaurant.secondaryColor,
        currency: restaurant.currency,
        allowPayAtCounter: restaurant.allowPayAtCounter,
        serviceFeePercent: Number(restaurant.serviceFeePercent),
        theme: restaurant.theme,
        settings: restaurant.settings,
        openingHours: restaurant.openingHours,
        paymentConfig: restaurant.paymentConfig,
        rewardConfig: restaurant.rewardConfig,
      },
      categories: serializedCategories,
      error: null,
    };
  },
  ["public-menu-payload"],
  {
    revalidate: 60,
    tags: [DATA_CACHE_TAGS.publicMenu],
  }
);

export async function getTableContextData(args: {
  token?: string;
  restaurantSlug?: string;
  restaurantName?: string;
  tableNumber?: string;
}): Promise<{ data: TableContext | null; error: string | null }> {
  const token = args.token?.trim() ?? "";
  const restaurantSlug = args.restaurantSlug?.trim() ?? "";
  const restaurantName = args.restaurantName?.trim() ?? "";
  const tableNumber = args.tableNumber?.trim() ?? "";

  try {
    if (token) {
      return getCachedTokenTableContext(token);
    }

    if (restaurantSlug && tableNumber) {
      return getCachedTableContextByRestaurant(
        restaurantSlug,
        restaurantName,
        tableNumber
      );
    }

    return {
      data: null,
      error: "Missing table or restaurant information. Open the link from your table QR code.",
    };
  } catch (error) {
    console.error(error);
    return {
      data: null,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function getRestaurantMenuPayload(
  args:
    | string
    | {
        slug: string;
        name?: string | null;
      }
): Promise<{
  restaurant: TableContext["restaurant"] | null;
  categories: MenuCategory[];
  error: string | null;
}> {
  const slug = typeof args === "string" ? args : args.slug;
  const name = typeof args === "string" ? "" : args.name?.trim() ?? "";
  try {
    return getCachedRestaurantMenuPayload(slug.trim(), name);
  } catch (error) {
    console.error(error);
    return {
      restaurant: null,
      categories: [],
      error: "Failed to load menu",
    };
  }
}
