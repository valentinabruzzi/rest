import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getStaffSession } from "@/lib/staff-auth";
import { toRewardDetails } from "@/lib/order-reward";
import { getRewardVerificationState } from "@/lib/reward-verification";

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
    const normalizedCode = body.code.toUpperCase();
    const reward = await prisma.orderReward.findUnique({
      where: { code: normalizedCode },
      include: {
        order: {
          include: {
            table: true,
            restaurant: { select: { id: true, name: true } },
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
    if (state === "already_redeemed") {
      return NextResponse.json(
        {
          error: "Already redeemed",
          reward: toRewardDetails(reward),
          order: {
            orderId: reward.order.id,
            orderNumber: reward.order.orderNumber,
            tableNumber: reward.order.table.tableNumber,
            restaurantName: reward.order.restaurant.name,
          },
        },
        { status: 409 }
      );
    }
    if (state === "expired") {
      return NextResponse.json(
        {
          error: "Expired",
          reward: toRewardDetails(reward),
          order: {
            orderId: reward.order.id,
            orderNumber: reward.order.orderNumber,
            tableNumber: reward.order.table.tableNumber,
            restaurantName: reward.order.restaurant.name,
          },
        },
        { status: 410 }
      );
    }

    const redeemed = await prisma.orderReward.update({
      where: { id: reward.id },
      data: { redeemedAt: new Date() },
      include: {
        order: {
          include: {
            table: true,
            restaurant: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json({
      reward: toRewardDetails(redeemed),
      order: {
        orderId: redeemed.order.id,
        orderNumber: redeemed.order.orderNumber,
        tableNumber: redeemed.order.table.tableNumber,
        restaurantName: redeemed.order.restaurant.name,
      },
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not redeem reward", 500);
  }
}
