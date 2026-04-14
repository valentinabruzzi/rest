import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-errors";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/staff-auth";
import { revalidateMenuReadCaches } from "@/lib/data-cache";
import { upsertDishRadarProductRecipe } from "@/lib/dish-radar";
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

const patchSchema = z.object({
  categoryId: z.union([z.string().min(1), z.null()]).optional(),
  name: z.string().trim().min(2).max(200).optional(),
  nameTranslations: nameTranslationsSchema,
  description: z.string().trim().max(2_000).optional(),
  price: z.number().int().min(0).optional(),
  imageUrl: imageSchema.optional(),
  active: z.boolean().optional(),
  customerNotesConfig: customerNoteConfigSchema.optional(),
  ingredients: ingredientSchema.min(1).optional(),
});

function serializeProduct(
  product: {
    id: string;
    name: string;
    nameTranslations: Prisma.JsonValue | null;
    description: string;
    price: number;
    imageUrl: string | null;
    active: boolean;
    sortOrder: number;
    categoryId: string | null;
    customerNotesConfig: Prisma.JsonValue | null;
    category: {
      id: string;
      name: string;
      active: boolean;
      sortOrder: number;
    } | null;
  }
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  const { id } = await params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid product payload", 400);
  }

  if (Object.keys(body).length === 0) {
    return jsonError("No changes", 400);
  }

  try {
    const current = await prisma.product.findFirst({
      where: {
        id,
        restaurantId: session.restaurantId,
      },
      select: {
        id: true,
      },
    });

    if (!current) {
      return jsonError("Item not found", 404);
    }

    if (body.categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: body.categoryId,
          restaurantId: session.restaurantId,
        },
        select: { id: true },
      });

      if (!category) {
        return jsonError("Category not found", 404);
      }
    }

    const product = await prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id },
        data: {
          name: body.name?.trim(),
          nameTranslations:
            body.nameTranslations === undefined
              ? undefined
              : (normalizeProductNameTranslations(body.nameTranslations) as Prisma.InputJsonValue),
          description: body.description?.trim(),
          price: body.price,
          imageUrl: body.imageUrl,
          active: body.active,
          customerNotesConfig:
            body.customerNotesConfig === undefined
              ? undefined
              : (body.customerNotesConfig as Prisma.InputJsonValue),
          category:
            body.categoryId === undefined
              ? undefined
              : body.categoryId === null
                ? { disconnect: true }
                : { connect: { id: body.categoryId } },
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

      if (body.ingredients !== undefined) {
        const restaurant = await tx.restaurant.findUnique({
          where: { id: session.restaurantId },
          select: {
            settings: true,
          },
        });

        const nextSettings = upsertDishRadarProductRecipe({
          settings: restaurant?.settings,
          productId: id,
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
      }

      return updatedProduct;
    });

    revalidateMenuReadCaches();

    return NextResponse.json({
      item: serializeProduct(product),
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not update item", 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  const { id } = await params;

  try {
    const current = await prisma.product.findFirst({
      where: {
        id,
        restaurantId: session.restaurantId,
      },
      select: {
        id: true,
      },
    });

    if (!current) {
      return jsonError("Item not found", 404);
    }

    await prisma.product.delete({
      where: { id },
    });

    revalidateMenuReadCaches();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonError(
      "Could not remove this item. If it has past orders, mark it unavailable instead.",
      409
    );
  }
}
