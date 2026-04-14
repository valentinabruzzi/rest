import type { Prisma } from "@/generated/prisma/client";

export const RELEASED_PAYMENT_STATUSES = [
  "paid",
  "paid_online",
  "paid_cash",
  "paid_counter_card",
  "paid_at_table",
] as const;

export const MANUAL_MARK_PAYMENT_STATUSES = [
  "paid_cash",
  "paid_counter_card",
  "paid_at_table",
] as const;

export const PAYMENT_FLOWS = ["online", "cashier", "waiter"] as const;
export const PAYMENT_METHODS = ["cash", "card", "online"] as const;
export const PAYMENT_MARKER_ROLES = ["manager", "waiter", "system"] as const;

const RELEASED_PAYMENT_STATUS_SET = new Set<string>(RELEASED_PAYMENT_STATUSES);
const PAYMENT_FLOW_SET = new Set<string>(PAYMENT_FLOWS);
const PAYMENT_METHOD_SET = new Set<string>(PAYMENT_METHODS);
const PAYMENT_MARKER_ROLE_SET = new Set<string>(PAYMENT_MARKER_ROLES);

export type ReleasedPaymentStatus = (typeof RELEASED_PAYMENT_STATUSES)[number];
export type ManualMarkPaymentStatus =
  (typeof MANUAL_MARK_PAYMENT_STATUSES)[number];
export type PaymentFlow = (typeof PAYMENT_FLOWS)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentMarkerRole = (typeof PAYMENT_MARKER_ROLES)[number];

export type StoredPaymentMeta = {
  version: 1;
  flow: PaymentFlow;
  requestedMethod?: Exclude<PaymentMethod, "online"> | null;
  actualMethod?: PaymentMethod | null;
  paidByRole?: PaymentMarkerRole | null;
  paidByLabel?: string | null;
  clientMutationId?: string | null;
};

function isPaymentFlow(value: unknown): value is PaymentFlow {
  return typeof value === "string" && PAYMENT_FLOW_SET.has(value);
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && PAYMENT_METHOD_SET.has(value);
}

function isPaymentMarkerRole(value: unknown): value is PaymentMarkerRole {
  return typeof value === "string" && PAYMENT_MARKER_ROLE_SET.has(value);
}

export function parseStoredPaymentMeta(
  value: Prisma.JsonValue | null | undefined
): StoredPaymentMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const rawMeta = value as Record<string, unknown>;
  if (rawMeta.version !== 1 || !isPaymentFlow(rawMeta.flow)) {
    return null;
  }

  return {
    version: 1,
    flow: rawMeta.flow,
    requestedMethod:
      rawMeta.requestedMethod === null || rawMeta.requestedMethod === undefined
        ? null
        : isPaymentMethod(rawMeta.requestedMethod) &&
            rawMeta.requestedMethod !== "online"
          ? rawMeta.requestedMethod
          : null,
    actualMethod:
      rawMeta.actualMethod === null || rawMeta.actualMethod === undefined
        ? null
        : isPaymentMethod(rawMeta.actualMethod)
          ? rawMeta.actualMethod
          : null,
    paidByRole:
      rawMeta.paidByRole === null || rawMeta.paidByRole === undefined
        ? null
        : isPaymentMarkerRole(rawMeta.paidByRole)
          ? rawMeta.paidByRole
          : null,
    paidByLabel:
      typeof rawMeta.paidByLabel === "string" && rawMeta.paidByLabel.trim()
        ? rawMeta.paidByLabel.trim()
        : null,
    clientMutationId:
      typeof rawMeta.clientMutationId === "string" && rawMeta.clientMutationId.trim()
        ? rawMeta.clientMutationId.trim()
        : null,
  };
}

export function createInitialPaymentMeta(args: {
  payMode: "online" | "counter";
  counterService?: "cashier" | "waiter";
  counterWaiterPayment?: "card" | "cash";
  clientMutationId?: string | null;
}): StoredPaymentMeta {
  const clientMutationId = args.clientMutationId?.trim() || null;

  if (args.payMode === "online") {
    return {
      version: 1,
      flow: "online",
      requestedMethod: null,
      actualMethod: null,
      paidByRole: null,
      paidByLabel: null,
      clientMutationId,
    };
  }

  return {
    version: 1,
    flow: args.counterService === "waiter" ? "waiter" : "cashier",
    requestedMethod:
      args.counterService === "waiter" ? args.counterWaiterPayment ?? null : null,
    actualMethod: null,
    paidByRole: null,
    paidByLabel: null,
    clientMutationId,
  };
}

function inferActualMethod(
  paymentStatus: ReleasedPaymentStatus,
  meta: StoredPaymentMeta | null
): PaymentMethod | null {
  if (paymentStatus === "paid_online") return "online";
  if (paymentStatus === "paid_counter_card") return "card";
  if (paymentStatus === "paid_cash") return "cash";
  if (paymentStatus === "paid_at_table") {
    return meta?.requestedMethod ?? null;
  }
  return meta?.actualMethod ?? null;
}

export function markPaymentCaptured(
  value: Prisma.JsonValue | null | undefined,
  args: {
    paymentStatus: ReleasedPaymentStatus;
    actor: PaymentMarkerRole;
    actorLabel?: string | null;
  }
): StoredPaymentMeta {
  const currentMeta = parseStoredPaymentMeta(value) ?? {
    version: 1 as const,
    flow: args.paymentStatus === "paid_at_table" ? "waiter" : "cashier",
    requestedMethod: null,
    actualMethod: null,
    paidByRole: null,
    paidByLabel: null,
  };

  return {
    version: 1,
    flow: currentMeta.flow,
    requestedMethod: currentMeta.requestedMethod ?? null,
    actualMethod: inferActualMethod(args.paymentStatus, currentMeta),
    paidByRole: args.actor,
    paidByLabel: args.actorLabel?.trim() || null,
    clientMutationId: currentMeta.clientMutationId ?? null,
  };
}

export function isReleasedPaymentStatus(status: string | null | undefined) {
  return typeof status === "string" && RELEASED_PAYMENT_STATUS_SET.has(status);
}

export function isPendingPaymentStatus(status: string | null | undefined) {
  return status === "pending" || status === "failed";
}

export function getPendingPaymentFlow(
  value: Prisma.JsonValue | null | undefined
): Exclude<PaymentFlow, "online"> | null {
  const meta = parseStoredPaymentMeta(value);
  if (!meta) return null;
  return meta.flow === "cashier" || meta.flow === "waiter" ? meta.flow : null;
}

export function getRequestedPaymentMethod(
  value: Prisma.JsonValue | null | undefined
) {
  return parseStoredPaymentMeta(value)?.requestedMethod ?? null;
}

export function getActualPaymentMethod(
  value: Prisma.JsonValue | null | undefined
) {
  return parseStoredPaymentMeta(value)?.actualMethod ?? null;
}

export function getPaymentMarker(
  value: Prisma.JsonValue | null | undefined
) {
  const meta = parseStoredPaymentMeta(value);
  return {
    role: meta?.paidByRole ?? null,
    label: meta?.paidByLabel ?? null,
  };
}

export function getPendingPaymentMethodLabel(args: {
  requestedMethod: "card" | "cash" | null;
  flow: Exclude<PaymentFlow, "online"> | null;
}) {
  if (args.flow === "cashier") return "Da scegliere in cassa";
  if (args.requestedMethod === "card") return "Carta al tavolo";
  if (args.requestedMethod === "cash") return "Contanti al tavolo";
  if (args.flow === "waiter") return "Pagamento al tavolo";
  return "In attesa";
}
