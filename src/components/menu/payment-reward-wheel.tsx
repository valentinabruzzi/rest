"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { getCustomerUiCopy, getRewardCopy } from "@/lib/customer-i18n";
import type { RestaurantLanguageCode } from "@/lib/restaurant-branding";
import { REWARD_SECTORS } from "@/lib/order-reward";
import type { RewardDetails } from "@/types/reward";

const SPIN_DURATION_MS = 4200;
const FULL_TURNS = 5;
const SECTOR_DEGREES = 360 / REWARD_SECTORS.length;
const LABEL_LAYOUTS = [
  { x: "50%", y: "16.5%", width: "6.9rem" },
  { x: "82%", y: "50%", width: "6.1rem" },
  { x: "50%", y: "83.5%", width: "6.9rem" },
  { x: "18%", y: "50%", width: "6.1rem" },
];
const LEAF_BURST = [
  { x: "-138px", y: "-94px", start: "-34deg", end: "-12deg", delay: "0ms" },
  { x: "-82px", y: "-142px", start: "-8deg", end: "18deg", delay: "35ms" },
  { x: "96px", y: "-134px", start: "14deg", end: "52deg", delay: "80ms" },
  { x: "144px", y: "-42px", start: "36deg", end: "78deg", delay: "130ms" },
  { x: "132px", y: "108px", start: "92deg", end: "132deg", delay: "170ms" },
  { x: "34px", y: "148px", start: "138deg", end: "178deg", delay: "220ms" },
  { x: "-112px", y: "134px", start: "182deg", end: "224deg", delay: "260ms" },
  { x: "-146px", y: "18px", start: "226deg", end: "268deg", delay: "310ms" },
];

type Props = {
  open: boolean;
  language?: RestaurantLanguageCode;
  reward: RewardDetails;
  onComplete: () => void;
};

function formatWheelLabel(label: string) {
  const words = label.split(" ").filter(Boolean);
  if (words.length <= 2) return words;
  if (words.includes("+")) {
    return [words[0], words.slice(1, 3).join(" "), words.slice(3).join(" ")].filter(Boolean);
  }
  return [words[0], words.slice(1).join(" ")];
}

function getWheelCenterLabel(language: RestaurantLanguageCode) {
  if (language === "en") return "Prize";
  if (language === "fr") return "Cadeau";
  if (language === "es") return "Premio";
  if (language === "de") return "Preis";
  return "Premio";
}

export function PaymentRewardWheel({
  open,
  language = "it",
  reward,
  onComplete,
}: Props) {
  const [rotation, setRotation] = useState(0);
  const [settled, setSettled] = useState(false);
  const copy = getCustomerUiCopy(language);
  const localizedReward = getRewardCopy(reward.prizeType, language);

  useEffect(() => {
    if (!open) {
      setRotation(0);
      setSettled(false);
      return;
    }

    const targetRotation = FULL_TURNS * 360 - reward.sector * SECTOR_DEGREES;

    setRotation(0);
    setSettled(false);

    const spinTimer = window.setTimeout(() => {
      setRotation(targetRotation);
    }, 40);

    const settleTimer = window.setTimeout(() => {
      setSettled(true);
    }, SPIN_DURATION_MS + 40);

    return () => {
      window.clearTimeout(spinTimer);
      window.clearTimeout(settleTimer);
    };
  }, [open, reward.sector]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reward-wheel-title"
        className="w-full max-w-md rounded-[calc(var(--radius-card)*1.5)] bg-canvas-elevated p-5 shadow-2xl"
      >
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          {copy.rewardWheelTitle}
        </p>
        <h2
          id="reward-wheel-title"
          className="mt-3 text-2xl font-semibold tracking-tight text-ink"
        >
          {settled ? copy.rewardResultTitle : copy.rewardSpinningTitle}
        </h2>
        {!settled ? (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {copy.rewardSpinningText}
          </p>
        ) : null}

        <div className="relative mx-auto mt-8 h-72 w-72 max-w-full">
          {settled && reward.winner
            ? LEAF_BURST.map((leaf) => (
                <span
                  key={`${leaf.x}-${leaf.y}`}
                  className="reward-leaf"
                  style={
                    {
                      "--leaf-x": leaf.x,
                      "--leaf-y": leaf.y,
                      "--leaf-rotate-start": leaf.start,
                      "--leaf-rotate-end": leaf.end,
                      animationDelay: leaf.delay,
                    } as CSSProperties
                  }
                />
              ))
            : null}

          <div className="absolute left-1/2 top-0 z-20 h-0 w-0 -translate-x-1/2 border-x-[16px] border-b-[28px] border-x-transparent border-b-bordeaux drop-shadow-md" />
          <div className="absolute inset-0 rounded-full bg-canvas shadow-[0_20px_45px_rgba(28,28,28,0.18)]" />
          <div
            className="absolute inset-[10px] rounded-full border-[10px] border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
            style={{
              background:
                "conic-gradient(from -45deg, #6E0F1F 0deg 90deg, #8A2A39 90deg 180deg, #4E0915 180deg 270deg, #B55263 270deg 360deg)",
              transform: `rotate(${rotation}deg)`,
              transition: `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
            }}
          >
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_54%)]" />
            <div className="absolute inset-0 rotate-45 rounded-full">
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/14" />
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/14" />
            </div>

            {REWARD_SECTORS.map((sector, index) => {
              const layout = LABEL_LAYOUTS[index];
              const lines = formatWheelLabel(
                getRewardCopy(sector.prizeType, language).wheelLabel
              );

              return (
                <div
                  key={`${sector.prizeType}-${index}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: layout.x,
                    top: layout.y,
                    width: layout.width,
                  }}
                >
                  <div
                    className="text-center text-[9px] font-semibold uppercase tracking-[0.2em] text-white"
                    style={{
                      lineHeight: 1.16,
                      textShadow: "0 1px 2px rgba(28, 28, 28, 0.22)",
                    }}
                  >
                    {lines.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/95 text-center shadow-lg">
              <span className="px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-bordeaux">
                {getWheelCenterLabel(language)}
              </span>
            </div>
          </div>
        </div>

        {settled ? (
          <>
            <div className="mt-6 rounded-[var(--radius-card)] border border-hairline bg-canvas px-4 py-4">
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink">
                {localizedReward.winner ? localizedReward.title : copy.noPrizeTitle}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {localizedReward.winner
                  ? localizedReward.description
                  : copy.noPrizeDescription}
              </p>

              {reward.winner && reward.code ? (
                <div className="mt-4 rounded-[var(--radius-card)] border border-bordeaux/15 bg-bordeaux/5 px-3 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                    {copy.rewardCodeLabel}
                  </p>
                  <p className="mt-1 text-lg font-semibold tracking-[0.08em] text-ink">
                    {reward.code}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    {copy.rewardCodeHint}
                  </p>
                </div>
              ) : (
                <div className="reward-sigh mt-4 flex items-center gap-3 text-muted">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 28 28"
                    className="h-7 w-7 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <circle cx="14" cy="14" r="10.25" />
                    <circle cx="10.5" cy="11.25" r="0.8" fill="currentColor" stroke="none" />
                    <circle cx="17.5" cy="11.25" r="0.8" fill="currentColor" stroke="none" />
                    <path d="M9.8 18.1c1.1-1.1 2.5-1.65 4.2-1.65s3.1.55 4.2 1.65" />
                  </svg>
                  <p className="text-xs font-medium uppercase tracking-[0.14em]">
                    {copy.tryAgainLabel}
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onComplete}
              className="mt-6 w-full rounded-[var(--radius-card)] bg-bordeaux py-3.5 text-sm font-medium text-white shadow-[var(--shadow-soft)] transition hover:bg-bordeaux-dark"
            >
              {copy.continueLabel}
            </button>
          </>
        ) : (
          <p className="mt-8 text-center text-xs font-medium uppercase tracking-[0.18em] text-muted">
            {copy.rewardPendingLabel}
          </p>
        )}
      </div>
    </div>
  );
}
