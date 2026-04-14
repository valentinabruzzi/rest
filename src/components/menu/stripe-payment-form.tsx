"use client";

import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { FormEvent, useState } from "react";
import type { CustomerUiCopy } from "@/lib/customer-i18n";
import type { RewardDetails } from "@/types/reward";

type Props = {
  orderId: string;
  copy: CustomerUiCopy;
  onSuccess: (reward: RewardDetails | null) => void;
  preview?: boolean;
  previewReward?: RewardDetails | null;
};

export function StripePaymentForm({
  orderId,
  copy,
  onSuccess,
  preview = false,
  previewReward = null,
}: Props) {
  if (preview) {
    return (
      <PreviewStripePaymentForm
        copy={copy}
        onSuccess={onSuccess}
        previewReward={previewReward}
      />
    );
  }

  return (
    <LiveStripePaymentForm orderId={orderId} copy={copy} onSuccess={onSuccess} />
  );
}

function PreviewStripePaymentForm({
  copy,
  onSuccess,
  previewReward,
}: {
  copy: CustomerUiCopy;
  onSuccess: (reward: RewardDetails | null) => void;
  previewReward: RewardDetails | null;
}) {
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    onSuccess(previewReward);
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-4">
        <div className="rounded-[var(--radius-card)] border border-dashed border-hairline bg-white px-4 py-5 text-sm text-muted">
          Clone preview del pagamento: stesso punto del flusso, nessuna operazione Stripe reale.
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[var(--radius-card)] bg-bordeaux py-3.5 text-sm font-medium text-white shadow-[var(--shadow-soft)] transition hover:bg-bordeaux-dark disabled:opacity-40"
      >
        {loading ? copy.processing : copy.payNow}
      </button>
    </form>
  );
}

function LiveStripePaymentForm({
  orderId,
  copy,
  onSuccess,
}: {
  orderId: string;
  copy: CustomerUiCopy;
  onSuccess: (reward: RewardDetails | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

    const { error: confirmError, paymentIntent } =
      await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

    if (confirmError) {
      setError(confirmError.message ?? copy.paymentCouldNotComplete);
      setLoading(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      let reward: RewardDetails | null = null;
      try {
        const res = await fetch(`/api/orders/${orderId}/sync-payment`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          reward = data.reward ?? null;
        }
      } catch {
        /* webhook may still apply */
      }
      onSuccess(reward);
    } else {
      setError(copy.paymentStillProcessing);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-3">
        <PaymentElement
          options={{
            layout: { type: "tabs", defaultCollapsed: false },
          }}
        />
      </div>
      {error ? (
        <p className="text-sm text-bordeaux" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!stripe || !elements || loading}
        className="w-full rounded-[var(--radius-card)] bg-bordeaux py-3.5 text-sm font-medium text-white shadow-[var(--shadow-soft)] transition hover:bg-bordeaux-dark disabled:opacity-40"
      >
        {loading ? copy.processing : copy.payNow}
      </button>
    </form>
  );
}
