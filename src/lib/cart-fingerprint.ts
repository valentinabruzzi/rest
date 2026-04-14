import type { CartLine } from "@/types/cart";

export function cartLineFingerprint(line: {
  productId: string;
  selectedOptions: CartLine["selectedOptions"];
  selectedNotes: CartLine["selectedNotes"];
  notes: string | null;
}): string {
  const opts = [...line.selectedOptions]
    .sort((a, b) => a.groupId.localeCompare(b.groupId))
    .map(
      (o) =>
        `${o.groupId}:${[...o.optionIds].sort().join(",")}:${o.priceDeltaCents}`
    )
    .join("|");
  const selectedNotes = [...line.selectedNotes]
    .sort((a, b) =>
      `${a.noteId}:${a.optionId ?? ""}`.localeCompare(
        `${b.noteId}:${b.optionId ?? ""}`
      )
    )
    .map((selection) => `${selection.noteId}:${selection.optionId ?? ""}`)
    .join(",");
  return `${line.productId}::${opts}::${selectedNotes}::${line.notes ?? ""}`;
}
