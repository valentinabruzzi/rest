"use client";

import Image from "next/image";
import type { CustomerUiCopy } from "@/lib/customer-i18n";
import type { MenuProduct } from "@/types/menu";
import { formatCents } from "@/lib/money";

type Props = {
  product: MenuProduct;
  currency: string;
  copy: CustomerUiCopy;
  quantity: number;
  onOpen: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
};

export function ProductListItem({
  product,
  currency,
  copy,
  quantity,
  onOpen,
  onIncrement,
  onDecrement,
}: Props) {
  return (
    <article className="flex gap-3 rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-3 shadow-[var(--shadow-soft)] transition hover:border-bordeaux/20">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 gap-4 text-left"
      >
        <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-canvas">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt=""
              fill
              className="object-cover"
              sizes="72px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted">
              —
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="font-medium tracking-tight text-ink">{product.name}</h3>
            {product.volumeLabel ? (
              <span className="text-xs text-muted">{product.volumeLabel}</span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted">
            {product.description}
          </p>
          {product.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {product.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded border border-hairline px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          {product.optionGroups.some((group) => group.required) ? (
            <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              {copy.chooseOptionsFirst}
            </p>
          ) : null}
        </div>
      </button>

      <div className="flex shrink-0 flex-col items-end justify-between py-0.5">
        <span className="text-sm font-semibold tabular-nums text-ink">
          {formatCents(product.price, currency)}
        </span>

        {quantity > 0 ? (
          <div className="flex items-center gap-1 rounded-full border border-hairline bg-canvas px-1 py-1">
            <button
              type="button"
              onClick={onDecrement}
              className="flex h-8 w-8 items-center justify-center rounded-full text-base text-ink transition hover:bg-canvas-elevated"
              aria-label={`${copy.decreaseQuantity} ${product.name}`}
            >
              −
            </button>
            <span className="min-w-[2ch] text-center text-sm font-medium tabular-nums text-ink">
              {quantity}
            </span>
            <button
              type="button"
              onClick={onIncrement}
              className="flex h-8 w-8 items-center justify-center rounded-full text-base text-ink transition hover:bg-canvas-elevated"
              aria-label={`${copy.increaseQuantity} ${product.name}`}
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onIncrement}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-bordeaux text-lg font-medium text-white shadow-[var(--shadow-soft)] transition hover:bg-bordeaux-dark"
            aria-label={`${copy.addToOrder} ${product.name}`}
          >
            +
          </button>
        )}
      </div>
    </article>
  );
}
