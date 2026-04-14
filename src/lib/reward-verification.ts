import { getRewardSectorContent } from "@/lib/order-reward";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REWARD_VALID_DAYS = 90;

type RewardRecordLike = {
  code: string | null;
  prizeType: string;
  sector: number;
  createdAt: Date;
  redeemedAt: Date | null;
};

export type RewardVerificationState =
  | "valid"
  | "already_redeemed"
  | "expired"
  | "not_found";

export function getRewardExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + REWARD_VALID_DAYS * DAY_MS);
}

export function getRewardVerificationState(
  reward: RewardRecordLike | null
): RewardVerificationState {
  if (!reward || !reward.code || reward.prizeType === "none") {
    return "not_found";
  }

  if (reward.redeemedAt) {
    return "already_redeemed";
  }

  if (getRewardExpiresAt(reward.createdAt).getTime() < Date.now()) {
    return "expired";
  }

  return "valid";
}

export function getRewardVerificationTitle(sector: number): string {
  return getRewardSectorContent(sector).title;
}
