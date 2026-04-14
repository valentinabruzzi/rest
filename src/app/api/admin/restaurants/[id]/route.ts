import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getAdminAuthorized } from "@/lib/staff-auth";
import { revalidateAllRestaurantReadCaches } from "@/lib/data-cache";
import { hashPassword } from "@/lib/password";
import { normalizeRestaurantNameInput } from "@/lib/restaurant-directory";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().min(1).max(120).optional(),
  logoUrl: z.string().trim().url().optional().nullable(),
  primaryColor: z.string().trim().min(4).max(20).optional(),
  secondaryColor: z.string().trim().min(4).max(20).optional(),
  currency: z.string().trim().min(3).max(8).optional(),
  active: z.boolean().optional(),
  allowPayAtCounter: z.boolean().optional(),
  serviceFeePercent: z.number().min(0).max(100).optional(),
  theme: z.any().optional().nullable(),
  settings: z.any().optional().nullable(),
  openingHours: z.any().optional().nullable(),
  paymentConfig: z.any().optional().nullable(),
  rewardConfig: z.any().optional().nullable(),
  staffPassword: z.string().min(4).max(120).optional().nullable(),
});

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isRestaurantIdentityUniqueError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const prismaError = error as {
    code?: unknown;
    meta?: { target?: unknown };
  };
  if (prismaError.code !== "P2002") return false;
  const target = prismaError.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("slug") && target.includes("name");
  }
  const text = String(target ?? "");
  return text.includes("slug") && text.includes("name");
}

function isLegacySlugUniqueError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const prismaError = error as {
    code?: unknown;
    meta?: { target?: unknown };
  };
  if (prismaError.code !== "P2002") return false;
  const target = prismaError.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("slug") && !target.includes("name");
  }
  const text = String(target ?? "");
  return text.includes("slug") && !text.includes("name");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await getAdminAuthorized();
  if (!ok) return jsonError("Unauthorized", 401);

  const { id } = await params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid body", 400);
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const normalizedName = normalizeRestaurantNameInput(body.name);
    if (!normalizedName) {
      return jsonError("Invalid restaurant name", 400);
    }
    updateData.name = normalizedName;
  }
  if (body.slug !== undefined) {
    const normalizedSlug = normalizeSlug(body.slug);
    if (!normalizedSlug) {
      return jsonError("Invalid restaurant slug", 400);
    }
    updateData.slug = normalizedSlug;
  }
  if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl?.trim() || null;
  if (body.primaryColor !== undefined) updateData.primaryColor = body.primaryColor.trim();
  if (body.secondaryColor !== undefined) {
    updateData.secondaryColor = body.secondaryColor.trim();
  }
  if (body.currency !== undefined) updateData.currency = body.currency.trim().toLowerCase();
  if (body.active !== undefined) updateData.active = body.active;
  if (body.allowPayAtCounter !== undefined) {
    updateData.allowPayAtCounter = body.allowPayAtCounter;
  }
  if (body.serviceFeePercent !== undefined) {
    updateData.serviceFeePercent = body.serviceFeePercent;
  }
  if (body.theme !== undefined) updateData.theme = body.theme;
  if (body.settings !== undefined) updateData.settings = body.settings;
  if (body.openingHours !== undefined) updateData.openingHours = body.openingHours;
  if (body.paymentConfig !== undefined) updateData.paymentConfig = body.paymentConfig;
  if (body.rewardConfig !== undefined) updateData.rewardConfig = body.rewardConfig;

  if (
    Object.keys(updateData).length === 0 &&
    !body.staffPassword?.trim()
  ) {
    return jsonError("No changes", 400);
  }

  try {
    if (
      typeof updateData.slug === "string" ||
      typeof updateData.name === "string"
    ) {
      const currentRestaurant = await prisma.restaurant.findUnique({
        where: { id },
        select: { name: true, slug: true },
      });

      if (!currentRestaurant) {
        return jsonError("Restaurant not found", 404);
      }

      const nextSlug =
        typeof updateData.slug === "string" ? updateData.slug : currentRestaurant.slug;
      const nextName =
        typeof updateData.name === "string" ? updateData.name : currentRestaurant.name;
      const existingByIdentity = await prisma.restaurant.findFirst({
        where: {
          slug: nextSlug,
          name: nextName,
          NOT: { id },
        },
        select: { id: true },
      });

      if (existingByIdentity) {
        return jsonError(
          "Esiste gia un locale con questo nome e questo slug.",
          409
        );
      }
    }

    const restaurant = await prisma.$transaction(async (tx) => {
      const updatedRestaurant = Object.keys(updateData).length
        ? await tx.restaurant.update({
            where: { id },
            data: updateData,
          })
        : await tx.restaurant.findUnique({ where: { id } });

      if (!updatedRestaurant) {
        throw new Error("NOT_FOUND");
      }

      if (body.staffPassword?.trim()) {
        const firstStaffUser = await tx.staffUser.findFirst({
          where: {
            restaurantId: id,
          },
          orderBy: { createdAt: "asc" },
        });

        if (firstStaffUser) {
          await tx.staffUser.update({
            where: { id: firstStaffUser.id },
            data: {
              passwordHash: hashPassword(body.staffPassword.trim()),
              active: true,
            },
          });
        } else {
          await tx.staffUser.create({
            data: {
              restaurantId: id,
              name: "Main staff",
              passwordHash: hashPassword(body.staffPassword.trim()),
            },
          });
        }
      }

      return updatedRestaurant;
    });

    revalidateAllRestaurantReadCaches();

    return NextResponse.json({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      active: restaurant.active,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError("Restaurant not found", 404);
    }
    if (isRestaurantIdentityUniqueError(error)) {
      return jsonError(
        "Esiste gia un locale con questo nome e questo slug.",
        409
      );
    }
    if (isLegacySlugUniqueError(error)) {
      return jsonError(
        "Il database sta ancora usando lo slug come univoco. Applica la nuova migrazione per permettere slug uguali con nomi diversi.",
        409
      );
    }
    console.error(error);
    return jsonError("Could not update restaurant", 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await getAdminAuthorized();
  if (!ok) return jsonError("Unauthorized", 401);

  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      });

      if (!restaurant) {
        throw new Error("NOT_FOUND");
      }

      const removed = {
        categories: await tx.category.count({ where: { restaurantId: id } }),
        products: await tx.product.count({ where: { restaurantId: id } }),
        staffUsers: await tx.staffUser.count({ where: { restaurantId: id } }),
        tables: await tx.table.count({ where: { restaurantId: id } }),
        orders: await tx.order.count({ where: { restaurantId: id } }),
        rewards: await tx.orderReward.count({ where: { restaurantId: id } }),
        staffRequests: await tx.staffRequest.count({ where: { restaurantId: id } }),
      };

      await tx.staffRequest.deleteMany({
        where: { restaurantId: id },
      });
      await tx.orderReward.deleteMany({
        where: { restaurantId: id },
      });
      await tx.order.deleteMany({
        where: { restaurantId: id },
      });
      await tx.table.deleteMany({
        where: { restaurantId: id },
      });
      await tx.product.deleteMany({
        where: { restaurantId: id },
      });
      await tx.category.deleteMany({
        where: { restaurantId: id },
      });
      await tx.staffUser.deleteMany({
        where: { restaurantId: id },
      });
      await tx.restaurant.delete({
        where: { id },
      });

      return {
        restaurant,
        removed,
      };
    });

    revalidateAllRestaurantReadCaches();

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return jsonError("Restaurant not found", 404);
    }
    console.error(error);
    return jsonError("Could not delete restaurant", 500);
  }
}
