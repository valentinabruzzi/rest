"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  type ProductCustomerNoteSelection,
} from "@/lib/product-customer-notes";
import type { CustomerUiCopy } from "@/lib/customer-i18n";
import type { MenuProduct, MenuOptionGroup } from "@/types/menu";
import type { SelectedOptionLine } from "@/types/cart";
import { formatCents } from "@/lib/money";

type Props = {
  product: MenuProduct;
  currency: string;
  copy: CustomerUiCopy;
  onClose: () => void;
  onAdd: (args: {
    quantity: number;
    selectedNotes: ProductCustomerNoteSelection[];
    notes: string | null;
    selectedOptions: SelectedOptionLine[];
  }) => void;
};

function buildSelection(
  groups: MenuOptionGroup[],
  picked: Map<string, Set<string>>
): SelectedOptionLine[] {
  const out: SelectedOptionLine[] = [];
  for (const g of groups) {
    const set = picked.get(g.id);
    if (!set || set.size === 0) continue;
    const optionIds = [...set];
    let priceDeltaCents = 0;
    const labels: string[] = [];
    for (const oid of optionIds) {
      const o = g.options.find((x) => x.id === oid);
      if (o) {
        priceDeltaCents += o.priceDelta;
        labels.push(o.name);
      }
    }
    out.push({
      groupId: g.id,
      groupName: g.name,
      optionIds,
      labels,
      priceDeltaCents,
    });
  }
  return out;
}

export function ProductSheet({
  product,
  currency,
  copy,
  onClose,
  onAdd,
}: Props) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [activeSingleNoteIds, setActiveSingleNoteIds] = useState<string[]>([]);
  const [choiceNoteSelections, setChoiceNoteSelections] = useState<
    Record<string, string>
  >({});
  const [picked, setPicked] = useState<Map<string, Set<string>>>(() => {
    const m = new Map<string, Set<string>>();
    for (const g of product.optionGroups) {
      m.set(g.id, new Set());
    }
    return m;
  });

  const selectedLines = useMemo(
    () => buildSelection(product.optionGroups, picked),
    [product.optionGroups, picked]
  );

  const singleCustomerNotes = useMemo(
    () => product.customerNotes.filter((noteConfig) => noteConfig.kind === "single"),
    [product.customerNotes]
  );

  const choiceCustomerNotes = useMemo(
    () => product.customerNotes.filter((noteConfig) => noteConfig.kind === "choice"),
    [product.customerNotes]
  );

  const selectedCustomerNotes = useMemo(() => {
    const singleSelections = product.customerNotes
      .filter(
        (noteConfig) =>
          noteConfig.kind === "single" &&
          activeSingleNoteIds.includes(noteConfig.id)
      )
      .map((noteConfig) => ({
        noteId: noteConfig.id,
        noteLabel: noteConfig.label,
        optionId: null,
        optionLabel: null,
      }));

    const choiceSelections = product.customerNotes
      .filter((noteConfig) => noteConfig.kind === "choice")
      .flatMap((noteConfig) => {
        const selectedOptionId = choiceNoteSelections[noteConfig.id];
        if (!selectedOptionId) return [];

        const selectedOption = noteConfig.options.find(
          (option) => option.id === selectedOptionId
        );
        if (!selectedOption) return [];

        return [
          {
            noteId: noteConfig.id,
            noteLabel: noteConfig.label,
            optionId: selectedOption.id,
            optionLabel: selectedOption.label,
          },
        ];
      });

    return [...singleSelections, ...choiceSelections];
  }, [activeSingleNoteIds, choiceNoteSelections, product.customerNotes]);

  const optionExtra = selectedLines.reduce((s, l) => s + l.priceDeltaCents, 0);
  const unitTotal = product.price + optionExtra;
  const lineTotal = unitTotal * qty;

  const validationError = useMemo(() => {
    for (const g of product.optionGroups) {
      if (!g.required) continue;
      const set = picked.get(g.id);
      if (!set || set.size === 0) {
        return `${copy.chooseOption}: ${g.name}.`;
      }
    }
    return null;
  }, [copy.chooseOption, product.optionGroups, picked]);

  function toggleOption(group: MenuOptionGroup, optionId: string) {
    setPicked((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(group.id) ?? []);
      if (group.multiple) {
        if (set.has(optionId)) set.delete(optionId);
        else set.add(optionId);
      } else {
        set.clear();
        set.add(optionId);
      }
      next.set(group.id, set);
      return next;
    });
  }

  function toggleSingleCustomerNote(noteId: string) {
    setActiveSingleNoteIds((current) =>
      current.includes(noteId)
        ? current.filter((id) => id !== noteId)
        : [...current, noteId]
    );
  }

  function updateChoiceCustomerNote(noteId: string, optionId: string) {
    setChoiceNoteSelections((current) => ({
      ...current,
      [noteId]: optionId,
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/40 backdrop-blur-[2px]">
      <button
        type="button"
        className="min-h-[20%] flex-1"
        aria-label={copy.close}
        onClick={onClose}
      />
      <div className="max-h-[85vh] overflow-y-auto rounded-t-2xl border border-hairline border-b-0 bg-canvas-elevated shadow-[0_-8px_32px_rgb(28_28_28/0.08)]">
        <div className="mx-auto w-full max-w-lg px-5 pb-8 pt-3">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline" />
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-card)] bg-canvas">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt=""
                fill
                className="object-cover"
                sizes="100vw"
                priority
              />
            ) : null}
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink">
            {product.name}
          </h2>
          {product.volumeLabel ? (
            <p className="mt-1 text-sm text-muted">{product.volumeLabel}</p>
          ) : null}
          <p className="mt-3 text-sm text-muted">{product.description}</p>
          <p className="mt-4 text-lg font-semibold tabular-nums text-ink">
            {formatCents(product.price, currency)}
            {optionExtra !== 0 ? (
              <span className="ml-2 text-sm font-medium text-muted">
                {copy.optionsExtra} {formatCents(optionExtra, currency)}
              </span>
            ) : null}
          </p>

          {product.optionGroups.map((g) => (
            <div key={g.id} className="mt-6 border-t border-hairline pt-5">
              <p className="text-sm font-medium text-ink">
                {g.name}
                {g.required ? (
                  <span className="ml-2 text-xs font-normal text-muted">
                    {copy.required}
                  </span>
                ) : null}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {g.options.map((o) => {
                  const set = picked.get(g.id);
                  const on = set?.has(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggleOption(g, o.id)}
                      className={
                        on
                          ? "flex items-center justify-between rounded-[var(--radius-card)] border border-bordeaux bg-bordeaux/5 px-3 py-2.5 text-left text-sm text-ink"
                          : "flex items-center justify-between rounded-[var(--radius-card)] border border-hairline px-3 py-2.5 text-left text-sm text-ink transition hover:border-bordeaux/25"
                      }
                    >
                      <span>{o.name}</span>
                      {o.priceDelta !== 0 ? (
                        <span className="text-xs tabular-nums text-muted">
                          +{formatCents(o.priceDelta, currency)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {product.customerNotes.length > 0 ? (
            <div className="mt-6 border-t border-hairline pt-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink">{copy.notesTitle}</span>
                <span className="text-xs uppercase tracking-[0.16em] text-muted">
                  {copy.optional}
                </span>
              </div>

              {singleCustomerNotes.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {singleCustomerNotes.map((noteConfig) => {
                    const active = activeSingleNoteIds.includes(noteConfig.id);
                    return (
                      <button
                        key={noteConfig.id}
                        type="button"
                        onClick={() => toggleSingleCustomerNote(noteConfig.id)}
                        className={
                          active
                            ? "rounded-full border border-bordeaux bg-bordeaux/5 px-3 py-2 text-sm text-ink"
                            : "rounded-full border border-hairline bg-white px-3 py-2 text-sm text-ink"
                        }
                      >
                        {noteConfig.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {choiceCustomerNotes.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {choiceCustomerNotes.map((noteConfig) => (
                    <label key={noteConfig.id} className="block">
                      <span className="mb-1.5 block text-sm font-medium text-ink">
                        {noteConfig.label}
                      </span>
                      <select
                        value={choiceNoteSelections[noteConfig.id] ?? ""}
                        onChange={(event) =>
                          updateChoiceCustomerNote(noteConfig.id, event.target.value)
                        }
                        className="w-full rounded-[var(--radius-card)] border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                      >
                        <option value="">{copy.chooseOption}</option>
                        {noteConfig.options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {product.allergens.length > 0 ? (
            <p className="mt-6 text-xs leading-relaxed text-muted">
              <span className="font-medium text-ink">{copy.allergens}: </span>
              {product.allergens.join(", ")}
            </p>
          ) : null}

          <label className="mt-6 block">
            <span className="text-sm font-medium text-ink">{copy.noteForKitchen}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={copy.optional}
              className="mt-2 w-full resize-none rounded-[var(--radius-card)] border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none ring-bordeaux/20 placeholder:text-muted focus:ring-2"
            />
          </label>

          <div className="mt-6 flex items-center justify-between border-t border-hairline pt-5">
            <span className="text-sm text-muted">{copy.quantity}</span>
            <div className="flex items-center gap-3 rounded-full border border-hairline bg-canvas px-1 py-1">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink transition hover:bg-canvas-elevated"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label={copy.decreaseQuantity}
              >
                −
              </button>
              <span className="min-w-[2ch] text-center text-sm font-medium tabular-nums">
                {qty}
              </span>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink transition hover:bg-canvas-elevated"
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                aria-label={copy.increaseQuantity}
              >
                +
              </button>
            </div>
          </div>

          {validationError ? (
            <p className="mt-3 text-sm text-bordeaux">{validationError}</p>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">{copy.total}</p>
              <p className="text-lg font-semibold tabular-nums text-ink">
                {formatCents(lineTotal, currency)}
              </p>
            </div>
            <button
              type="button"
              disabled={!!validationError}
              onClick={() =>
                onAdd({
                  quantity: qty,
                  selectedNotes: selectedCustomerNotes,
                  notes: note.trim() || null,
                  selectedOptions: buildSelection(product.optionGroups, picked),
                })
              }
              className="min-w-[10rem] rounded-[var(--radius-card)] bg-bordeaux px-5 py-3 text-sm font-medium text-white shadow-[var(--shadow-soft)] transition hover:bg-bordeaux-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copy.addToOrder}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
