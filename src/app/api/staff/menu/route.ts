import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-errors";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/staff-auth";
import { revalidateMenuReadCaches } from "@/lib/data-cache";
import { upsertDishRadarProductRecipe } from "@/lib/dish-radar";
import { getStaffMenuEditorPayload } from "@/lib/staff-view-data";
import { normalizeProductNameTranslations } from "@/lib/menu-item-name";
import { normalizeProductCustomerNotesConfig } from "@/lib/product-customer-notes";

const imageSchema = z.union([z.string().trim().max(2_000_000), z.null()]);
const nameTranslationsSchema = z
  .object({
    it: z.string().trim().max(200).optional(),
    en: z.string().trim().max(200).optional(),
    fr: z.string().trim().max(200).optional(),
    es: z.string().trim().max(200).optional(),
    de: z.string().trim().max(200).optional(),
  })
  .optional()
  .nullable();
const customerNoteConfigSchema = z.array(
  z.object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(2).max(80),
    kind: z.enum(["single", "choice"]),
    options: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(80),
          label: z.string().trim().min(2).max(80),
        })
      )
      .default([]),
  })
);
const ingredientSchema = z.array(
  z.object({
    ingredientId: z.string().trim().min(1).max(80).nullable().optional(),
    name: z.string().trim().min(2).max(80),
    quantity: z.number().positive().max(1_000_000),
  })
);

const createSchema = z.object({
  categoryId: z.union([z.string().min(1), z.null()]).optional().default(null),
  name: z.string().trim().min(2).max(200),
  nameTranslations: nameTranslationsSchema,
  description: z.string().trim().max(2_000).optional().default(""),
  price: z.number().int().min(0),
  imageUrl: imageSchema.optional().default(null),
  active: z.boolean().optional().default(true),
  customerNotesConfig: customerNoteConfigSchema.optional().default([]),
  ingredients: ingredientSchema.min(1),
});

function serializeProduct(
  product: Prisma.ProductGetPayload<{
    include: {
      category: {
        select: {
          id: true;
          name: true;
          active: true;
          sortOrder: true;
        };
      };
    };
  }>
) {
  return {
    id: product.id,
    name: product.name,
    nameTranslations: normalizeProductNameTranslations(product.nameTranslations),
    description: product.description,
    price: product.price,
    imageUrl: product.imageUrl,
    active: product.active,
    sortOrder: product.sortOrder,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? "No category yet",
    categoryActive: product.category?.active ?? true,
    categorySortOrder: product.category?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    isUncategorized: product.categoryId == null,
    customerNotes: normalizeProductCustomerNotesConfig(product.customerNotesConfig),
  };
}

export async function GET() {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  try {
    const payload = await getStaffMenuEditorPayload(session.restaurantId);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not load menu", 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid product payload", 400);
  }

  try {
    if (body.categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: body.categoryId,
          restaurantId: session.restaurantId,
        },
        select: {
          id: true,
        },
      });

      if (!category) {
        return jsonError("Category not found", 404);
      }
    }

    const lastProduct = await prisma.product.findFirst({
      where: {
        restaurantId: session.restaurantId,
        categoryId: body.categoryId,
      },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const product = await prisma.$transaction(async (tx) => {
      const createdProduct = await tx.product.create({
        data: {
          restaurantId: session.restaurantId,
          name: body.name.trim(),
          nameTranslations:
            normalizeProductNameTranslations(body.nameTranslations) as Prisma.InputJsonValue,
          description: body.description.trim(),
          price: body.price,
          imageUrl: body.imageUrl,
          active: body.active,
          allergens: [],
          tags: [],
          sortOrder: (lastProduct?.sortOrder ?? -1) + 1,
          customerNotesConfig: body.customerNotesConfig as Prisma.InputJsonValue,
          categoryId: body.categoryId,
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              active: true,
              sortOrder: true,
            },
          },
        },
      });

      const restaurant = await tx.restaurant.findUnique({
        where: { id: session.restaurantId },
        select: {
          settings: true,
        },
      });

      const nextSettings = upsertDishRadarProductRecipe({
        settings: restaurant?.settings,
        productId: createdProduct.id,
        ingredients: body.ingredients.map((ingredient) => ({
          ingredientId: ingredient.ingredientId ?? null,
          name: ingredient.name,
          quantity: ingredient.quantity,
        })),
      }).settings;

      await tx.restaurant.update({
        where: { id: session.restaurantId },
        data: {
          settings: nextSettings as Prisma.InputJsonValue,
        },
      });

      return createdProduct;
    });

    revalidateMenuReadCaches();

    return NextResponse.json({
      item: serializeProduct(product),
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not create product", 500);
  }
}
