import { randomBytes, randomInt } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  getRewardSectorContent,
  pickWeightedRewardSector,
  toRewardDetails,
} from "@/lib/order-reward";

type RewardTx = Prisma.TransactionClient;

async function allocateRewardCode(tx: RewardTx) {
  for (let i = 0; i < 8; i += 1) {
    const code = `BB-${randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await tx.orderReward.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!existing) return code;
  }

  throw new Error("Could not allocate reward code");
}

export async function ensureOrderReward(tx: RewardTx, orderId: string) {
  const existing = await tx.orderReward.findUnique({
    where: { orderId },
  });
  if (existing) return toRewardDetails(existing);

  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      restaurantId: true,
    },
  });
  if (!order) {
    throw new Error("Order not found while creating reward");
  }

  const sector = pickWeightedRewardSector(
    randomInt(100),
    randomInt(10_000) / 10_000
  );
  const content = getRewardSectorContent(sector);
  const code = content.winner ? await allocateRewardCode(tx) : null;

  try {
    const reward = await tx.orderReward.create({
      data: {
        restaurant: {
          connect: {
            id: order.restaurantId,
          },
        },
        order: {
          connect: {
            id: orderId,
          },
        },
        sector,
        prizeType: content.prizeType,
        code,
      },
    });
    return toRewardDetails(reward);
  } catch (error) {
    const fallback = await tx.orderReward.findUnique({
      where: { orderId },
    });
    if (fallback) return toRewardDetails(fallback);
    throw error;
  }
}
