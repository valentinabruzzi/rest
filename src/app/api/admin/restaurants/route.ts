import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getAdminAuthorized } from "@/lib/staff-auth";
import { revalidateAllRestaurantReadCaches } from "@/lib/data-cache";
import { hashPassword } from "@/lib/password";
import { normalizeRestaurantNameInput } from "@/lib/restaurant-directory";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(1).max(120),
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
  initialTables: z.number().int().min(0).max(200).optional(),
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

export async function POST(req: NextRequest) {
  const ok = await getAdminAuthorized();
  if (!ok) return jsonError("Unauthorized", 401);

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid restaurant payload", 400);
  }

  const slug = normalizeSlug(body.slug);
  const name = normalizeRestaurantNameInput(body.name);
  if (!slug) return jsonError("Invalid restaurant slug", 400);
  if (!name) return jsonError("Invalid restaurant name", 400);

  try {
    const existingByIdentity = await prisma.restaurant.findFirst({
      where: {
        slug,
        name,
      },
      select: { id: true },
    });
    if (existingByIdentity) {
      return jsonError(
        "Esiste gia un locale con questo nome e questo slug.",
        409
      );
    }

    const restaurant = await prisma.$transaction(async (tx) => {
      const createdRestaurant = await tx.restaurant.create({
        data: {
          name,
          slug,
          logoUrl: body.logoUrl?.trim() || null,
          primaryColor: body.primaryColor?.trim() || "#6E0F1F",
          secondaryColor: body.secondaryColor?.trim() || "#4E0915",
          currency: body.currency?.trim().toLowerCase() || "eur",
          active: body.active ?? true,
          allowPayAtCounter: body.allowPayAtCounter ?? true,
          serviceFeePercent: body.serviceFeePercent ?? 0,
          theme: body.theme ?? null,
          settings: body.settings ?? null,
          openingHours: body.openingHours ?? null,
          paymentConfig: body.paymentConfig ?? null,
          rewardConfig: body.rewardConfig ?? null,
        },
      });

      if (body.staffPassword?.trim()) {
        await tx.staffUser.create({
          data: {
            restaurantId: createdRestaurant.id,
            name: "Main staff",
            passwordHash: hashPassword(body.staffPassword.trim()),
          },
        });
      }

      const initialTables = body.initialTables ?? 0;
      if (initialTables > 0) {
        await tx.table.createMany({
          data: Array.from({ length: initialTables }, (_, index) => ({
            restaurantId: createdRestaurant.id,
            tableNumber: String(index + 1),
            qrCodeToken: randomBytes(16).toString("hex"),
            active: true,
          })),
        });
      }

      return createdRestaurant;
    });

    revalidateAllRestaurantReadCaches();

    return NextResponse.json({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
    });
  } catch (error) {
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
    return jsonError("Could not create restaurant", 500);
  }
}
