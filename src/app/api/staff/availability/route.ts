import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { jsonError } from "@/lib/api-errors";
import { setRestaurantDishRadarConfig } from "@/lib/dish-radar";
import { getStaffSession } from "@/lib/staff-auth";
import { buildStaffAvailabilityPayload } from "@/lib/staff-availability";
import { prisma } from "@/lib/prisma";

const configSchema = z.object({
  ingredients: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        name: z.string().trim().min(2).max(80),
        unit: z.enum(["g", "ml", "pcs"]),
        stock: z.number().min(0).max(1_000_000),
        sortOrder: z.number().int().optional().default(0),
      })
    )
    .default([]),
  products: z
    .array(
      z.object({
        productId: z.string().trim().min(1).max(80),
        autoPause: z.boolean().default(true),
        recipe: z
          .array(
            z.object({
              ingredientId: z.string().trim().min(1).max(80),
              quantity: z.number().positive().max(1_000_000),
            })
          )
          .default([]),
      })
    )
    .default([]),
});

export async function GET() {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  try {
    const payload = await buildStaffAvailabilityPayload(session.restaurantId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return jsonError("Could not load Dish Radar", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  let body: z.infer<typeof configSchema>;
  try {
    body = configSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid Dish Radar payload", 400);
  }

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.restaurantId },
      select: {
        id: true,
        settings: true,
      },
    });

    if (!restaurant) {
      return jsonError("Restaurant not found", 404);
    }

    const nextSettings = setRestaurantDishRadarConfig(restaurant.settings, {
      ingredients: body.ingredients,
      products: body.products,
    });

    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        settings: nextSettings as Prisma.InputJsonValue,
      },
    });

    const payload = await buildStaffAvailabilityPayload(session.restaurantId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return jsonError("Could not save Dish Radar", 500);
  }
}
