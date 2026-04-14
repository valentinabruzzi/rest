import type {
  StaffRequestKind,
  StaffRequestOption,
  StaffRequestSummary,
} from "@/types/staff-request";

const PAYMENT_REQUEST_PREFIX = "pagamento al tavolo richiesto:";
const STAFF_REQUEST_OPTIONS = new Set<StaffRequestOption>([
  "general",
  "ordering",
  "payment_counter",
  "payment_card",
  "payment_cash",
  "cutlery_napkins",
  "assistance",
  "table_cleanup",
  "order_information",
]);

type StoredStaffRequestNote = {
  version: 1;
  kind: StaffRequestKind;
  requestType: StaffRequestOption | null;
  note: string | null;
};

type StaffRequestLike = {
  id: string;
  type: "waiter_call";
  note: string | null;
  status: "new" | "in_progress" | "closed";
  createdAt: Date | string;
  updatedAt: Date | string;
  closedAt: Date | string | null;
  restaurantName: string;
  tableNumber: string;
  orderId: string | null;
  orderNumber: string | null;
};

function toIsoString(value: Date | string | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString();
}

function isStaffRequestOption(value: string): value is StaffRequestOption {
  return STAFF_REQUEST_OPTIONS.has(value as StaffRequestOption);
}

function parseLegacyStaffRequest(note: string | null | undefined): {
  kind: StaffRequestKind;
  requestType: StaffRequestOption | null;
  note: string | null;
} {
  const trimmed = note?.trim() ?? "";
  const normalized = trimmed.toLowerCase();

  if (normalized.startsWith(PAYMENT_REQUEST_PREFIX)) {
    if (normalized.includes("carta")) {
      return {
        kind: "payment_request",
        requestType: "payment_card",
        note: null,
      };
    }

    if (normalized.includes("contanti")) {
      return {
        kind: "payment_request",
        requestType: "payment_cash",
        note: null,
      };
    }

    return {
      kind: "payment_request",
      requestType: "general",
      note: null,
    };
  }

  return {
    kind: "table_assistance",
    requestType: "general",
    note: trimmed || null,
  };
}

export function parseStaffRequestNote(note: string | null | undefined): {
  kind: StaffRequestKind;
  requestType: StaffRequestOption | null;
  note: string | null;
} {
  const trimmed = note?.trim() ?? "";
  if (!trimmed.startsWith("{")) {
    return parseLegacyStaffRequest(note);
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      version?: number;
      kind?: string;
      requestType?: string | null;
      note?: string | null;
    };
    if (
      parsed.version !== 1 ||
      (parsed.kind !== "payment_request" &&
        parsed.kind !== "payment_assistance" &&
        parsed.kind !== "table_assistance")
    ) {
      return parseLegacyStaffRequest(note);
    }

    return {
      kind: parsed.kind === "payment_assistance" ? "payment_request" : parsed.kind,
      requestType:
        typeof parsed.requestType === "string" && isStaffRequestOption(parsed.requestType)
          ? parsed.requestType
          : null,
      note: typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null,
    };
  } catch {
    return parseLegacyStaffRequest(note);
  }
}

export function serializeStaffRequestNote({
  kind,
  requestType,
  note,
}: {
  kind: StaffRequestKind;
  requestType?: StaffRequestOption | null;
  note?: string | null;
}): string | null {
  const normalizedRequestType =
    requestType && isStaffRequestOption(requestType) ? requestType : null;
  const normalizedNote = note?.trim() || null;

  if (!normalizedRequestType && !normalizedNote) {
    return null;
  }

  const payload: StoredStaffRequestNote = {
    version: 1,
    kind,
    requestType: normalizedRequestType,
    note: normalizedNote,
  };

  return JSON.stringify(payload);
}

export function getStaffRequestKind(note: string | null | undefined): StaffRequestKind {
  return parseStaffRequestNote(note).kind;
}

export function getStaffRequestTitle(kind: StaffRequestKind): string {
  return kind === "payment_request" ? "Richiesta pagamento" : "Richiesta tavolo";
}

export function getStaffRequestTypeLabel(
  requestType: StaffRequestOption | null | undefined,
  kind: StaffRequestKind
): string {
  switch (requestType) {
    case "payment_counter":
      return "Pagamento cassa";
    case "payment_card":
      return "Pagamento carta";
    case "payment_cash":
      return "Pagamento contanti";
    case "ordering":
      return "Ordinazione";
    case "cutlery_napkins":
      return "Posate / tovaglioli";
    case "assistance":
      return "Assistenza generica";
    case "table_cleanup":
      return "Pulizia tavolo";
    case "order_information":
      return "Informazione su ordine";
    case "general":
    default:
      return kind === "payment_request"
        ? "Richiesta pagamento"
        : "Assistenza tavolo";
  }
}

export function getStaffRequestDetail(note: string | null | undefined): string {
  const parsed = parseStaffRequestNote(note);

  if (parsed.kind === "payment_request") {
    if (parsed.requestType === "payment_counter") {
      return "Pagamento richiesto in cassa.";
    }

    if (parsed.requestType === "payment_card") {
      return "Pagamento al tavolo con carta richiesto.";
    }

    if (parsed.requestType === "payment_cash") {
      return "Pagamento al tavolo in contanti richiesto.";
    }

    return "Il cliente ha richiesto il pagamento.";
  }

  if (parsed.requestType === "cutlery_napkins") {
    return "Il tavolo ha richiesto posate o tovaglioli.";
  }

  if (parsed.requestType === "ordering") {
    return "Il tavolo desidera ordinare con il cameriere.";
  }

  if (parsed.requestType === "assistance") {
    return "Il tavolo ha richiesto assistenza generica.";
  }

  if (parsed.requestType === "table_cleanup") {
    return "Il tavolo ha richiesto la pulizia del tavolo.";
  }

  if (parsed.requestType === "order_information") {
    return "Il tavolo ha chiesto informazioni sull'ordine.";
  }

  if (parsed.note) {
    return parsed.note;
  }

  return "Il tavolo ha richiesto assistenza generica.";
}

export function toStaffRequestSummary(
  request: StaffRequestLike
): StaffRequestSummary {
  const parsed = parseStaffRequestNote(request.note);
  const kind = parsed.kind;

  return {
    id: request.id,
    type: request.type,
    kind,
    requestType: parsed.requestType,
    requestTypeLabel: getStaffRequestTypeLabel(parsed.requestType, kind),
    title: getStaffRequestTitle(kind),
    detail: getStaffRequestDetail(request.note),
    note: parsed.note,
    status: request.status,
    createdAt: toIsoString(request.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(request.updatedAt) ?? new Date().toISOString(),
    closedAt: toIsoString(request.closedAt),
    restaurantName: request.restaurantName,
    tableNumber: request.tableNumber,
    orderId: request.orderId,
    orderNumber: request.orderNumber,
  };
}
