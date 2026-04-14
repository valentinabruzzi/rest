import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { jsonError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import {
  getRestaurantStaffAccess,
  mergeRestaurantStaffAccess,
} from "@/lib/staff-access";
import { getStaffSession } from "@/lib/staff-auth";

const rolePinsSchema = z.object({
  waiter: z.array(z.string().trim().max(12)).default([]),
  bar: z.array(z.string().trim().max(12)).default([]),
  kitchen: z.array(z.string().trim().max(12)).default([]),
  manager: z.array(z.string().trim().max(12)).default([]),
});

const patchSchema = z.object({
  rolePins: rolePinsSchema,
});

export async function GET() {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.restaurantId },
      select: { settings: true },
    });

    return NextResponse.json({
      rolePins: getRestaurantStaffAccess(restaurant?.settings).rolePins,
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not load staff access", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid staff access payload", 400);
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

    const nextSettings = mergeRestaurantStaffAccess({
      settings: restaurant.settings,
      updates: {
        rolePins: body.rolePins,
      },
    });

    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        settings: nextSettings as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      rolePins: getRestaurantStaffAccess(nextSettings).rolePins,
      settings: nextSettings,
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not save staff access", 500);
  }
}
