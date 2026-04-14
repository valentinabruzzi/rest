"use client";

import { useState } from "react";
import {
  getCustomerUiCopy,
  getWaiterRequestCopy,
} from "@/lib/customer-i18n";
import type { RestaurantLanguageCode } from "@/lib/restaurant-branding";
import type { StaffRequestSummary } from "@/types/staff-request";

type Props = {
  orderId: string;
  language?: RestaurantLanguageCode;
  waiterRequest: StaffRequestSummary | null;
  preview?: boolean;
  onRequestChange: (next: StaffRequestSummary) => void;
};

export function WaiterCallPanel({
  orderId,
  language = "it",
  waiterRequest,
  preview = false,
  onRequestChange,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = getCustomerUiCopy(language);
  const requestCopy = getWaiterRequestCopy({
    language,
    kind: waiterRequest?.kind ?? null,
    status: waiterRequest?.status ?? null,
  });

  async function callWaiter() {
    setSubmitting(true);
    setError(null);

    if (preview) {
      onRequestChange({
        id: `preview-order-request-${Date.now()}`,
        type: "waiter_call",
        kind: "table_assistance",
        requestType: "assistance",
        requestTypeLabel: "assistance",
        title: "Richiesta cameriere",
        detail: "Preview: richiesta inviata in modalita editor.",
        note: "Preview mode",
        status: "new",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        closedAt: null,
        restaurantName: "Preview",
        tableNumber: "-",
        orderId,
        orderNumber: "PREVIEW",
      });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`/api/orders/${orderId}/waiter-call`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? copy.networkError);
        return;
      }

      onRequestChange(data.request);
    } catch {
      setError(copy.networkError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
        {copy.callWaiter}
      </p>
      <button
        type="button"
        onClick={callWaiter}
        disabled={submitting || requestCopy.disabled}
        className="mt-3 w-full rounded-[var(--radius-card)] border border-hairline bg-white py-3 text-sm font-medium text-ink transition hover:border-bordeaux hover:text-bordeaux disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? copy.sendingRequest : requestCopy.button}
      </button>
      <p className="mt-3 text-sm leading-relaxed text-muted">{requestCopy.helper}</p>
      {waiterRequest ? (
        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-bordeaux">
          {waiterRequest.status === "new"
            ? copy.waiterStatusSent
            : waiterRequest.status === "in_progress"
              ? copy.waiterStatusInProgress
              : copy.waiterStatusClosed}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-bordeaux">{error}</p> : null}
    </div>
  );
}
