export type RewardPrizeType = "none" | "cocktail" | "cocktail_plus_aperitivo";

export type RewardDetails = {
  id: string;
  sector: number;
  prizeType: RewardPrizeType;
  wheelLabel: string;
  title: string;
  description: string;
  winner: boolean;
  code: string | null;
  redeemedAt: string | null;
  redeemable: boolean;
};
