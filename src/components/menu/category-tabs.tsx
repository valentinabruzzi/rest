"use client";

import type { MenuCategory } from "@/types/menu";

type Props = {
  categories: MenuCategory[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export function CategoryTabs({ categories, activeId, onSelect }: Props) {
  return (
    <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {categories.map((c) => {
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={
              active
                ? "shrink-0 rounded-full bg-bordeaux px-4 py-2 text-xs font-medium tracking-wide text-white"
                : "shrink-0 rounded-full border border-hairline bg-canvas-elevated px-4 py-2 text-xs font-medium tracking-wide text-ink shadow-[var(--shadow-soft)] transition hover:border-bordeaux/25"
            }
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
