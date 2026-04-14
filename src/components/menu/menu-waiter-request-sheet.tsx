"use client";

import {
  getCustomerRequestOptionLabel,
  type CustomerUiCopy,
} from "@/lib/customer-i18n";
import type { RestaurantLanguageCode } from "@/lib/restaurant-branding";
import {
  MENU_WAITER_REQUEST_OPTIONS,
  type StaffRequestOption,
} from "@/types/staff-request";

type Props = {
  open: boolean;
  copy: CustomerUiCopy;
  language: RestaurantLanguageCode;
  selectedRequestType: StaffRequestOption | null;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSelect: (requestType: StaffRequestOption | null) => void;
  onSubmit: () => void;
};

export function MenuWaiterRequestSheet({
  open,
  copy,
  language,
  selectedRequestType,
  submitting,
  error,
  onClose,
  onSelect,
  onSubmit,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/40 backdrop-blur-[2px]">
      <button
        type="button"
        className="min-h-[20%] flex-1"
        aria-label={copy.close}
        onClick={onClose}
      />
      <div className="rounded-t-2xl border border-hairline border-b-0 bg-canvas-elevated shadow-[0_-8px_32px_rgb(28_28_28/0.08)]">
        <div className="mx-auto w-full max-w-lg px-5 pb-8 pt-3">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline" />
          <p
            className="text-xs font-medium uppercase tracking-[0.2em] text-muted"
            data-admin-role="body"
            data-admin-key="waiter-call-label"
          >
            {copy.callWaiter}
          </p>
          <h2
            className="mt-3 text-xl font-semibold tracking-tight text-ink"
            data-admin-role="heading"
            data-admin-key="waiter-sheet-title"
          >
            {copy.waiterSheetTitle}
          </h2>
          <p
            className="mt-2 text-sm leading-relaxed text-muted"
            data-admin-role="body"
            data-admin-key="waiter-sheet-subtitle"
          >
            {copy.waiterSheetSubtitle}
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {MENU_WAITER_REQUEST_OPTIONS.map((option) => {
              const active = selectedRequestType === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelect(active ? null : option.id)}
                  className={
                    active
                      ? "rounded-[var(--radius-card)] border border-bordeaux bg-bordeaux/5 px-4 py-3 text-left text-sm text-ink"
                      : "rounded-[var(--radius-card)] border border-hairline bg-white px-4 py-3 text-left text-sm text-ink"
                  }
                >
                  <span data-admin-key={`waiter-option-${option.id}`}>
                    {getCustomerRequestOptionLabel(option.id, language)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-[var(--radius-card)] bg-canvas px-4 py-3 text-sm text-muted">
            <span data-admin-key="waiter-sheet-selected-label">{copy.waiterSheetSelected}</span>
            <span className="font-medium text-ink" data-admin-key="waiter-sheet-selected-value">
              {selectedRequestType
                ? getCustomerRequestOptionLabel(selectedRequestType, language)
                : copy.noneSelected}
            </span>
          </div>

          {error ? <p className="mt-4 text-sm text-bordeaux">{error}</p> : null}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[var(--radius-card)] border border-hairline bg-white py-3 text-sm font-medium text-ink"
            >
              <span data-admin-key="waiter-sheet-close">{copy.close}</span>
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="flex-1 rounded-[var(--radius-card)] bg-bordeaux py-3 text-sm font-medium text-white shadow-[var(--shadow-soft)] disabled:opacity-40"
            >
              <span data-admin-key="waiter-sheet-submit">
                {submitting ? copy.sendingRequest : copy.sendRequest}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
