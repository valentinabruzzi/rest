import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getStaffSession } from "@/lib/staff-auth";
import {
  getRewardExpiresAt,
  getRewardVerificationState,
} from "@/lib/reward-verification";

const bodySchema = z.object({
  code: z.string().trim().min(3),
});

export async function POST(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return jsonError("Invalid reward code", 400);
  }

  try {
    const reward = await prisma.orderReward.findUnique({
      where: { code: body.code.toUpperCase() },
      include: {
        order: {
          include: {
            restaurant: {
              select: { id: true, name: true },
            },
            table: true,
          },
        },
      },
    });

    if (reward && reward.order.restaurant.id !== session.restaurantId) {
      return jsonError("Reward not found", 404);
    }

    const state = getRewardVerificationState(reward);
    if (state === "not_found" || !reward) {
      return jsonError("Reward not found", 404);
    }

    const payload = {
      state,
      reward: {
        id: reward.id,
        code: reward.code,
        prizeType: reward.prizeType,
        title:
          reward.prizeType === "cocktail"
            ? "Cocktail gratis"
            : "Cocktail + aperitivo gratis",
        description:
          reward.prizeType === "cocktail"
            ? "La prossima volta che vieni a trovarci, hai un cocktail omaggio."
            : "La prossima volta che vieni con 5 persone, avrai il tuo cocktail offerto e un aperitivo da condividere con gli amici.",
        issuedAt: reward.createdAt.toISOString(),
        expiresAt: getRewardExpiresAt(reward.createdAt).toISOString(),
        redeemedAt: reward.redeemedAt?.toISOString() ?? null,
        currentStatus:
          state === "valid"
            ? "Valid"
            : state === "already_redeemed"
              ? "Already redeemed"
              : "Expired",
      },
      order: {
        orderId: reward.order.id,
        orderNumber: reward.order.orderNumber,
        tableNumber: reward.order.table.tableNumber,
        restaurantName: reward.order.restaurant.name,
      },
    };

    if (state === "already_redeemed") {
      return NextResponse.json(payload, { status: 409 });
    }

    if (state === "expired") {
      return NextResponse.json(payload, { status: 410 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return jsonError("Could not verify reward", 500);
  }
}
