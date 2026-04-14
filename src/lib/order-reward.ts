import type { RewardDetails, RewardPrizeType } from "@/types/reward";

type RewardSectorContent = {
  sector: number;
  prizeType: RewardPrizeType;
  wheelLabel: string;
  title: string;
  description: string;
  winner: boolean;
};

export const REWARD_SECTORS: RewardSectorContent[] = [
  {
    sector: 0,
    prizeType: "none",
    wheelLabel: "Nessun premio",
    title: "Nessun premio",
    description:
      "Questa volta non hai trovato un premio, ma il prossimo brindisi potrebbe sorprenderti.",
    winner: false,
  },
  {
    sector: 1,
    prizeType: "cocktail",
    wheelLabel: "Cocktail gratis",
    title: "Cocktail gratis",
    description:
      "La prossima volta che vieni a trovarci, hai un cocktail omaggio.",
    winner: true,
  },
  {
    sector: 2,
    prizeType: "none",
    wheelLabel: "Nessun premio",
    title: "Nessun premio",
    description:
      "Questa volta non hai trovato un premio, ma il prossimo brindisi potrebbe sorprenderti.",
    winner: false,
  },
  {
    sector: 3,
    prizeType: "cocktail_plus_aperitivo",
    wheelLabel: "Cocktail + aperitivo gratis",
    title: "Cocktail + aperitivo gratis",
    description:
      "La prossima volta che vieni con 5 persone, avrai il tuo cocktail offerto e un aperitivo da condividere con gli amici.",
    winner: true,
  },
];

export function getRewardSectorContent(sector: number): RewardSectorContent {
  const normalized = ((sector % REWARD_SECTORS.length) + REWARD_SECTORS.length) % REWARD_SECTORS.length;
  return REWARD_SECTORS[normalized];
}

export function pickWeightedRewardSector(randomValue: number, tiebreaker: number) {
  if (randomValue < 60) {
    return tiebreaker < 0.5 ? 0 : 2;
  }

  if (randomValue < 90) {
    return 1;
  }

  return 3;
}

type RewardRecordLike = {
  id: string;
  sector: number;
  prizeType: RewardPrizeType;
  code: string | null;
  redeemedAt: Date | string | null;
};

export function toRewardDetails(record: RewardRecordLike): RewardDetails {
  const content = getRewardSectorContent(record.sector);
  const redeemedAt =
    typeof record.redeemedAt === "string"
      ? record.redeemedAt
      : record.redeemedAt?.toISOString() ?? null;

  return {
    id: record.id,
    sector: content.sector,
    prizeType: record.prizeType,
    wheelLabel: content.wheelLabel,
    title: content.title,
    description: content.description,
    winner: content.winner,
    code: record.code,
    redeemedAt,
    redeemable: content.winner && !!record.code && !redeemedAt,
  };
}
