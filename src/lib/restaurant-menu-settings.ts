export type CustomerQuickNote = {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
};

type RestaurantSettingsShape = {
  customerQuickNotes?: unknown;
  [key: string]: unknown;
};

const DEFAULT_NOTE_LABELS = [
  "senza ghiaccio",
  "poco ghiaccio",
  "senza alcol",
  "extra limone",
  "senza zucchero",
  "al sangue",
  "media cottura",
  "ben cotto",
];

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

function asSettingsObject(settings: unknown): RestaurantSettingsShape {
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? ({ ...settings } as RestaurantSettingsShape)
    : {};
}

function normaliseLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim().replace(/\s+/g, " ");
  return next.length >= 2 ? next.slice(0, 60) : null;
}

function buildDefaultQuickNotes(): CustomerQuickNote[] {
  return DEFAULT_NOTE_LABELS.map((label, index) => ({
    id: slugify(label) || `note_${index + 1}`,
    label,
    active: true,
    sortOrder: index,
  }));
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

export function getRestaurantQuickNotes(settings: unknown): CustomerQuickNote[] {
  const settingsObject = asSettingsObject(settings);
  const rawQuickNotes = settingsObject.customerQuickNotes;
  if (!Array.isArray(rawQuickNotes)) {
    return buildDefaultQuickNotes();
  }
  if (rawQuickNotes.length === 0) {
    return [];
  }

  const usedIds = new Set<string>();
  const normalised = rawQuickNotes
    .map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      const label = normaliseLabel(row.label);
      if (!label) return null;

      const explicitId =
        typeof row.id === "string" && row.id.trim().length > 0
          ? row.id.trim()
          : slugify(label);

      return {
        id: ensureUniqueId(explicitId, usedIds),
        label,
        active: typeof row.active === "boolean" ? row.active : true,
        sortOrder:
          typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder)
            ? row.sortOrder
            : index,
      } satisfies CustomerQuickNote;
    })
    .filter((entry): entry is CustomerQuickNote => entry != null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "it"));
  return normalised;
}

export function buildQuickNoteId(label: string, existingNotes: CustomerQuickNote[]) {
  const usedIds = new Set(existingNotes.map((note) => note.id));
  return ensureUniqueId(slugify(label) || "note", usedIds);
}

export function setRestaurantQuickNotes(
  settings: unknown,
  quickNotes: CustomerQuickNote[]
) {
  const settingsObject = asSettingsObject(settings);
  settingsObject.customerQuickNotes = quickNotes.map((note, index) => ({
    id: note.id,
    label: note.label,
    active: note.active,
    sortOrder: index,
  }));
  return settingsObject;
}

export function getActiveRestaurantQuickNotes(settings: unknown) {
  return getRestaurantQuickNotes(settings).filter((note) => note.active);
}

export function getRestaurantQuickNoteLabels(settings: unknown) {
  return new Map(
    getActiveRestaurantQuickNotes(settings).map((note) => [note.id, note.label])
  );
}
