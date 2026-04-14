import type { ProductCustomerNoteSelection } from "@/lib/product-customer-notes";

export type SelectedOptionLine = {
  groupId: string;
  groupName: string;
  optionIds: string[];
  labels: string[];
  priceDeltaCents: number;
};

export type CartLine = {
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  selectedOptions: SelectedOptionLine[];
  selectedNotes: ProductCustomerNoteSelection[];
  notes: string | null;
};

export function lineSubtotal(line: CartLine): number {
  const opts = line.selectedOptions.reduce((s, o) => s + o.priceDeltaCents, 0);
  return (line.unitPriceCents + opts) * line.quantity;
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + lineSubtotal(l), 0);
}
