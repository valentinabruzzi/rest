import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getStaffSession } from "@/lib/staff-auth";
import {
  buildQuickNoteId,
  getRestaurantQuickNotes,
  setRestaurantQuickNotes,
} from "@/lib/restaurant-menu-settings";

const createSchema = z.object({
  label: z.string().trim().min(2).max(60),
  active: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid quick note payload", 400);
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
    const label = body.label.trim();
    const quickNote = {
      id: buildQuickNoteId(label, currentNotes),
      label,
      active: body.active,
      sortOrder: currentNotes.length,
    };

    const nextNotes = [...currentNotes, quickNote];
    await prisma.restaurant.update({
      where: { id: session.restaurantId },
      data: {
        settings: setRestaurantQuickNotes(
          restaurant.settings,
          nextNotes
        ) as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ quickNote });
  } catch (error) {
    console.error(error);
    return jsonError("Could not create quick note", 500);
  }
}
