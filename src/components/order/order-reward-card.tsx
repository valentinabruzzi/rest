import type { RewardDetails } from "@/types/reward";

type Props = {
  reward: RewardDetails;
};

export function OrderRewardCard({ reward }: Props) {
  return (
    <section
      className={
        reward.winner
          ? "mt-8 rounded-[var(--radius-card)] border border-bordeaux/15 bg-bordeaux/5 p-4 shadow-[var(--shadow-soft)]"
          : "mt-8 rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-4 shadow-[var(--shadow-soft)]"
      }
    >
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
        Premio finale
      </p>
      <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink">
        {reward.winner ? `HAI VINTO ${reward.title}` : reward.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {reward.description}
      </p>

      {reward.winner && reward.code ? (
        <div className="mt-4 rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated px-3 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Codice premio
          </p>
          <p className="mt-1 text-lg font-semibold tracking-[0.08em] text-ink">
            {reward.code}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Valido una sola volta e solo dopo verifica del locale dal sistema,
            fai uno screenshot e mostracelo la prossima volta che vieni a
            trovarci!!!
          </p>
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-bordeaux">
            {reward.redeemedAt ? "Premio gia usato" : "Premio disponibile"}
          </p>
        </div>
      ) : null}
    </section>
  );
}
