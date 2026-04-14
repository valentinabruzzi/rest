import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getStaffSession } from "@/lib/staff-auth";
import {
  getRestaurantQuickNotes,
  setRestaurantQuickNotes,
} from "@/lib/restaurant-menu-settings";

const patchSchema = z.object({
  label: z.string().trim().min(2).max(60).optional(),
  active: z.boolean().optional(),
});

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
    return jsonError("Invalid quick note payload", 400);
  }

  if (Object.keys(body).length === 0) {
    return jsonError("No changes", 400);
  }

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.restaurantId },
      select: { settings: true },
    });

    if (!restaurant) {
      return jsonError("Restaurant not found", 404);
    }

    const currentNotes = getRestaurantQuickNotes(restaurant.settings);
    const target = currentNotes.find((note) => note.id === id);
    if (!target) {
      return jsonError("Quick note not found", 404);
    }

    const nextNotes = currentNotes.map((note) =>
      note.id === id
        ? {
            ...note,
            label: body.label?.trim() ?? note.label,
            active: body.active ?? note.active,
          }
        : note
    );

    await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: {
        settings: setRestaurantQuickNotes(
          restaurant.settings,
          nextNotes
        ) as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      quickNote: nextNotes.find((note) => note.id === id),
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not update quick note", 500);
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
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: session.restaurantId },
      select: { settings: true },
    });

    if (!restaurant) {
      return jsonError("Restaurant not found", 404);
    }

    const currentNotes = getRestaurantQuickNotes(restaurant.settings);
    if (!currentNotes.some((note) => note.id === id)) {
      return jsonError("Quick note not found", 404);
    }

    const nextNotes = currentNotes.filter((note) => note.id !== id);
    await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: {
        settings: setRestaurantQuickNotes(
          restaurant.settings,
          nextNotes
        ) as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonError("Could not delete quick note", 500);
  }
}
