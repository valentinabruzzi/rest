"use client";

import Image from "next/image";
import { useCart } from "@/context/cart-context";
import type { CustomerUiCopy } from "@/lib/customer-i18n";
import { formatCents } from "@/lib/money";
import { formatProductCustomerNoteSelections } from "@/lib/product-customer-notes";
import type { SelectedOptionLine } from "@/types/cart";

function formatOpts(opts: SelectedOptionLine[]): string {
  return opts
    .map((o) => `${o.groupName}: ${o.labels.join(", ")}`)
    .filter(Boolean)
    .join(" · ");
}

type Props = {
  open: boolean;
  onClose: () => void;
  currency: string;
  copy: CustomerUiCopy;
  serviceFeeCents: number;
  discountCents: number;
  grandTotalCents: number;
  onCheckout: () => void;
};

export function CartDrawer({
  open,
  onClose,
  currency,
  copy,
  serviceFeeCents,
  discountCents,
  grandTotalCents,
  onCheckout,
}: Props) {
  const { lines, updateQuantity, removeLine } = useCart();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas-elevated">
      <header className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">{copy.yourOrder}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-muted transition hover:text-ink"
        >
          {copy.close}
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {lines.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted">
            {copy.emptyOrder}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {lines.map((line) => (
              <li
                key={line.id}
                className="flex gap-3 border-b border-hairline pb-4 last:border-0"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-canvas">
                  {line.imageUrl ? (
                    <Image
                      src={line.imageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted">
                      —
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{line.name}</p>
                  {line.selectedOptions.length > 0 ? (
                    <p className="mt-0.5 text-xs text-muted">
                      {formatOpts(line.selectedOptions)}
                    </p>
                  ) : null}
                  {line.selectedNotes.length > 0 ? (
                    <p className="mt-1 text-xs text-muted">
                      {copy.selectedNotes}:{" "}
                      {formatProductCustomerNoteSelections(line.selectedNotes)}
                    </p>
                  ) : null}
                  {line.notes ? (
                    <p className="mt-1 text-xs italic text-muted">
                      “{line.notes}”
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 rounded-full border border-hairline bg-canvas px-0.5 py-0.5">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-sm"
                        onClick={() =>
                          updateQuantity(line.id, line.quantity - 1)
                        }
                        aria-label={copy.decreaseQuantity}
                      >
                        −
                      </button>
                      <span className="min-w-[2ch] text-center text-xs font-medium tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-sm"
                        onClick={() =>
                          updateQuantity(line.id, line.quantity + 1)
                        }
                        aria-label={copy.increaseQuantity}
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        {formatCents(
                          (line.unitPriceCents +
                            line.selectedOptions.reduce(
                              (s, o) => s + o.priceDeltaCents,
                              0
                            )) *
                            line.quantity,
                          currency
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="mt-1 text-xs text-muted underline-offset-2 hover:text-bordeaux hover:underline"
                      >
                        {copy.remove}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="border-t border-hairline bg-canvas px-5 py-5">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted">
            <span>{copy.subtotal}</span>
            <span className="tabular-nums text-ink">
              {formatCents(
                lines.reduce(
                  (s, l) =>
                    s +
                    (l.unitPriceCents +
                      l.selectedOptions.reduce(
                        (x, o) => x + o.priceDeltaCents,
                        0
                      )) *
                      l.quantity,
                  0
                ),
                currency
              )}
            </span>
          </div>
          {discountCents > 0 ? (
            <div className="flex justify-between text-muted">
              <span>{copy.discount}</span>
              <span className="tabular-nums text-ink">
                −{formatCents(discountCents, currency)}
              </span>
            </div>
          ) : null}
          {serviceFeeCents > 0 ? (
            <div className="flex justify-between text-muted">
              <span>{copy.service}</span>
              <span className="tabular-nums text-ink">
                {formatCents(serviceFeeCents, currency)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-hairline pt-3 text-base font-semibold text-ink">
            <span>{copy.total}</span>
            <span className="tabular-nums">{formatCents(grandTotalCents, currency)}</span>
          </div>
        </div>
        <button
          type="button"
          disabled={lines.length === 0}
          onClick={onCheckout}
        className="mt-5 w-full rounded-[var(--radius-card)] bg-bordeaux py-3.5 text-sm font-medium text-white shadow-[var(--shadow-soft)] transition hover:bg-bordeaux-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
          {copy.proceedToPayment}
        </button>
      </footer>
    </div>
  );
}
