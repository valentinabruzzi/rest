import {
  type ProductCustomerNoteSelection,
  normalizeProductCustomerNoteSelections,
} from "@/lib/product-customer-notes";

type StoredQuickNote = {
  id: string;
  label: string;
};

type StoredItemNotesV1 = {
  version: 1;
  quickNotes: string[];
  note: string | null;
};

type StoredItemNotesV2 = {
  version: 2;
  quickNotes: StoredQuickNote[];
  note: string | null;
};

type StoredItemNotesV3 = {
  version: 3;
  selections: ProductCustomerNoteSelection[];
  note: string | null;
};

export function serializeItemNotes({
  selections,
  note,
}: {
  selections: ProductCustomerNoteSelection[];
  note: string | null;
}): string | null {
  const normalizedSelections = normalizeProductCustomerNoteSelections(selections);
  const normalizedNote = note?.trim() || null;

  if (normalizedSelections.length === 0) {
    return normalizedNote;
  }

  const payload: StoredItemNotesV3 = {
    version: 3,
    selections: normalizedSelections,
    note: normalizedNote,
  };

  return JSON.stringify(payload);
}

export function parseItemNotes(value: string | null | undefined): {
  selections: ProductCustomerNoteSelection[];
  note: string | null;
} {
  if (!value) {
    return {
      selections: [],
      note: null,
    };
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) {
    return {
      selections: [],
      note: trimmed || null,
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as
      | Partial<StoredItemNotesV1>
      | Partial<StoredItemNotesV2>
      | Partial<StoredItemNotesV3>;

    if (parsed.version === 3) {
      return {
        selections: normalizeProductCustomerNoteSelections(parsed.selections),
        note: typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null,
      };
    }

    if (parsed.version === 2 && Array.isArray(parsed.quickNotes)) {
      return {
        selections: normalizeProductCustomerNoteSelections(
          parsed.quickNotes.map((quickNote) => ({
            noteId:
              typeof quickNote?.id === "string" && quickNote.id.trim()
                ? quickNote.id.trim()
                : "",
            noteLabel:
              typeof quickNote?.label === "string" && quickNote.label.trim()
                ? quickNote.label.trim()
                : typeof quickNote?.id === "string"
                  ? quickNote.id
                  : "",
            optionId: null,
            optionLabel: null,
          }))
        ),
        note: typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null,
      };
    }

    if (parsed.version === 1 && Array.isArray(parsed.quickNotes)) {
      return {
        selections: normalizeProductCustomerNoteSelections(
          parsed.quickNotes.map((quickNote) => ({
            noteId: typeof quickNote === "string" ? quickNote : "",
            noteLabel: typeof quickNote === "string" ? quickNote : "",
            optionId: null,
            optionLabel: null,
          }))
        ),
        note: typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null,
      };
    }

    return {
      selections: [],
      note: trimmed || null,
    };
  } catch {
    return {
      selections: [],
      note: trimmed || null,
    };
  }
}

