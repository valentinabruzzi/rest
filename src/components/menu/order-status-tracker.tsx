"use client";

import { getCustomerOrderStatusLabel, getCustomerUiCopy } from "@/lib/customer-i18n";
import type { RestaurantLanguageCode } from "@/lib/restaurant-branding";
import {
  ACTIVE_ORDER_STATUSES,
  isPreReleaseOrderStatus,
  normalizeActiveOrderStatus,
} from "@/lib/order-status";

type Props = {
  status: string;
  language?: RestaurantLanguageCode;
};

export function OrderStatusTracker({ status, language = "it" }: Props) {
  const normalizedStatus = normalizeActiveOrderStatus(status);
  const copy = getCustomerUiCopy(language);
  const preRelease = isPreReleaseOrderStatus(status);
  let activeIndex = preRelease ? -1 : ACTIVE_ORDER_STATUSES.indexOf(normalizedStatus);
  if (!preRelease && activeIndex < 0) activeIndex = 0;

  return (
    <div className="mt-6">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
        {copy.orderStatusTitle}
      </p>
      {preRelease ? (
        <p className="mt-3 rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated px-4 py-3 text-sm text-muted">
          {copy.venueWillPrepareAfterPayment}
        </p>
      ) : null}
      <ol className="mt-4 space-y-0">
        {ACTIVE_ORDER_STATUSES.map((step, i) => {
          const done = !preRelease && i < activeIndex;
          const current = !preRelease && i === activeIndex;
          return (
            <li key={step} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={
                    done || current
                      ? "flex h-8 w-8 items-center justify-center rounded-full bg-bordeaux text-xs font-semibold text-white"
                      : "flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-canvas text-xs font-medium text-muted"
                  }
                >
                  {done ? "✓" : i + 1}
                </span>
                {i < ACTIVE_ORDER_STATUSES.length - 1 ? (
                  <span
                    className={
                      done
                        ? "my-1 min-h-[1.25rem] w-px grow bg-bordeaux"
                        : "my-1 min-h-[1.25rem] w-px grow bg-hairline"
                    }
                  />
                ) : null}
              </div>
              <div className="pb-6 pt-1">
                <p
                  className={
                    current
                      ? "text-sm font-semibold text-ink"
                      : "text-sm text-muted"
                  }
                >
                  {getCustomerOrderStatusLabel(step, language)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
