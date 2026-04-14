export type ProductCustomerNoteOption = {
  id: string;
  label: string;
};

export type ProductCustomerNoteConfig = {
  id: string;
  label: string;
  kind: "single" | "choice";
  options: ProductCustomerNoteOption[];
};

export type ProductCustomerNoteSelection = {
  noteId: string;
  noteLabel: string;
  optionId: string | null;
  optionLabel: string | null;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function normalizeLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length >= 2 ? normalized.slice(0, 80) : null;
}

function ensureUniqueId(baseId: string, usedIds: Set<string>) {
  const safeBase = baseId || "note";
  let nextId = safeBase;
  let counter = 2;
  while (usedIds.has(nextId)) {
    nextId = `${safeBase}_${counter}`;
    counter += 1;
  }
  usedIds.add(nextId);
  return nextId;
}

export function buildCustomerNoteId(label: string, existingIds: string[]) {
  const usedIds = new Set(existingIds);
  return ensureUniqueId(slugify(label) || "note", usedIds);
}

export function normalizeProductCustomerNotesConfig(
  value: unknown
): ProductCustomerNoteConfig[] {
  if (!Array.isArray(value)) return [];

  const usedNoteIds = new Set<string>();

  return value
    .map((entry, noteIndex) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      const label = normalizeLabel(row.label);
      if (!label) return null;

      const kind = row.kind === "choice" ? "choice" : "single";
      const rawOptions = Array.isArray(row.options) ? row.options : [];
      const usedOptionIds = new Set<string>();
      const options = rawOptions
        .map((option, optionIndex) => {
          if (!option || typeof option !== "object" || Array.isArray(option)) return null;
          const optionRow = option as Record<string, unknown>;
          const optionLabel = normalizeLabel(optionRow.label);
          if (!optionLabel) return null;

          const optionId =
            typeof optionRow.id === "string" && optionRow.id.trim()
              ? optionRow.id.trim()
              : slugify(optionLabel) || `option_${optionIndex + 1}`;

          return {
            id: ensureUniqueId(optionId, usedOptionIds),
            label: optionLabel,
          } satisfies ProductCustomerNoteOption;
        })
        .filter((option): option is ProductCustomerNoteOption => option != null);

      const noteId =
        typeof row.id === "string" && row.id.trim()
          ? row.id.trim()
          : slugify(label) || `note_${noteIndex + 1}`;

      return {
        id: ensureUniqueId(noteId, usedNoteIds),
        label,
        kind,
        options: kind === "choice" ? options : [],
      } satisfies ProductCustomerNoteConfig;
    })
    .filter((note): note is ProductCustomerNoteConfig => note != null);
}

export function normalizeProductCustomerNoteSelections(
  value: unknown
): ProductCustomerNoteSelection[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      const noteId =
        typeof row.noteId === "string" && row.noteId.trim() ? row.noteId.trim() : null;
      const noteLabel = normalizeLabel(row.noteLabel);
      if (!noteId || !noteLabel) return null;

      const optionId =
        typeof row.optionId === "string" && row.optionId.trim() ? row.optionId.trim() : null;
      const optionLabel = normalizeLabel(row.optionLabel);
      const fingerprint = `${noteId}:${optionId ?? ""}`;
      if (seen.has(fingerprint)) return null;
      seen.add(fingerprint);

      return {
        noteId,
        noteLabel,
        optionId,
        optionLabel: optionId ? optionLabel ?? optionId : null,
      } satisfies ProductCustomerNoteSelection;
    })
    .filter((selection): selection is ProductCustomerNoteSelection => selection != null);
}

export function formatProductCustomerNoteSelections(
  selections: ProductCustomerNoteSelection[]
) {
  return selections
    .map((selection) =>
      selection.optionLabel
        ? `${selection.noteLabel}: ${selection.optionLabel}`
        : selection.noteLabel
    )
    .join(", ");
}

