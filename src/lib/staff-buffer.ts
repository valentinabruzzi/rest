import type { DashboardRole } from "@/lib/order-stations";
import { createRestaurantIdentityKey } from "@/lib/restaurant-directory";
import type { ProductCustomerNoteSelection } from "@/lib/product-customer-notes";
import type { OrderColumn } from "@/types/staff-orders";

export type StaffBufferedPaymentStatus =
  | "paid_cash"
  | "paid_counter_card"
  | "paid_at_table";
export type StaffBufferedRequestStatus = "in_progress" | "closed";
export type StaffBufferedUiLanguage = "it" | "en";
export type StaffBufferedPaymentLocation = "cashier" | "table";
export type StaffBufferedPaymentMethod = "card" | "cash";

export type StaffBufferedOrderOptionSelection = {
  groupId: string;
  groupName: string;
  optionIds: string[];
  labels: string[];
  priceDeltaCents: number;
};

export type StaffBufferedCreateOrderItem = {
  productId: string;
  quantity: number;
  selectedNotes: ProductCustomerNoteSelection[];
  notes: string | null;
  selectedOptions: StaffBufferedOrderOptionSelection[];
};

export type StaffBufferedAction =
  | {
      id: string;
      kind: "order-status";
      createdAt: string;
      orderId: string;
      status: OrderColumn;
      actor: DashboardRole;
    }
  | {
      id: string;
      kind: "mark-paid";
      createdAt: string;
      orderId: string;
      paymentStatus: StaffBufferedPaymentStatus;
      actor: Extract<DashboardRole, "manager" | "waiter">;
      actorLabel: string | null;
    }
  | {
      id: string;
      kind: "request-status";
      createdAt: string;
      requestId: string;
      status: StaffBufferedRequestStatus;
    }
  | {
      id: string;
      kind: "create-order";
      createdAt: string;
      clientMutationId: string;
      payload: {
        tableId: string;
        language: StaffBufferedUiLanguage;
        paymentLocation: StaffBufferedPaymentLocation;
        paymentMethod: StaffBufferedPaymentMethod;
        items: StaffBufferedCreateOrderItem[];
      };
    };

const STAFF_BUFFER_PREFIX = "bb_staff_buffer_v1";

function getStaffBufferKey(args: { restaurantName: string; restaurantSlug: string }) {
  return `${STAFF_BUFFER_PREFIX}:${createRestaurantIdentityKey({
    name: args.restaurantName,
    slug: args.restaurantSlug,
  })}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isBufferedOptionSelection(
  value: unknown
): value is StaffBufferedOrderOptionSelection {
  return (
    isRecord(value) &&
    typeof value.groupId === "string" &&
    typeof value.groupName === "string" &&
    Array.isArray(value.optionIds) &&
    value.optionIds.every((item) => typeof item === "string") &&
    Array.isArray(value.labels) &&
    value.labels.every((item) => typeof item === "string") &&
    typeof value.priceDeltaCents === "number"
  );
}

function isBufferedCreateOrderItem(value: unknown): value is StaffBufferedCreateOrderItem {
  return (
    isRecord(value) &&
    typeof value.productId === "string" &&
    typeof value.quantity === "number" &&
    Array.isArray(value.selectedNotes) &&
    Array.isArray(value.selectedOptions) &&
    value.selectedOptions.every(isBufferedOptionSelection) &&
    (value.notes == null || typeof value.notes === "string")
  );
}

function isBufferedAction(value: unknown): value is StaffBufferedAction {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.createdAt !== "string") {
    return false;
  }

  if (value.kind === "order-status") {
    return (
      typeof value.orderId === "string" &&
      typeof value.status === "string" &&
      typeof value.actor === "string"
    );
  }

  if (value.kind === "mark-paid") {
    return (
      typeof value.orderId === "string" &&
      typeof value.paymentStatus === "string" &&
      typeof value.actor === "string" &&
      (value.actorLabel == null || typeof value.actorLabel === "string")
    );
  }

  if (value.kind === "request-status") {
    return typeof value.requestId === "string" && typeof value.status === "string";
  }

  if (value.kind === "create-order") {
    return (
      typeof value.clientMutationId === "string" &&
      isRecord(value.payload) &&
      typeof value.payload.tableId === "string" &&
      typeof value.payload.language === "string" &&
      typeof value.payload.paymentLocation === "string" &&
      typeof value.payload.paymentMethod === "string" &&
      Array.isArray(value.payload.items) &&
      value.payload.items.every(isBufferedCreateOrderItem)
    );
  }

  return false;
}

export function createStaffBufferedActionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `buffered-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readStaffBufferedActions(args: {
  restaurantName: string;
  restaurantSlug: string;
}) {
  if (typeof window === "undefined") return [] as StaffBufferedAction[];

  const raw = window.localStorage.getItem(getStaffBufferKey(args));
  if (!raw) return [] as StaffBufferedAction[];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as StaffBufferedAction[];
    return parsed.filter(isBufferedAction);
  } catch {
    return [] as StaffBufferedAction[];
  }
}

export function writeStaffBufferedActions(
  args: { restaurantName: string; restaurantSlug: string },
  actions: StaffBufferedAction[]
) {
  if (typeof window === "undefined") return;

  const key = getStaffBufferKey(args);
  if (actions.length === 0) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(actions));
}

export function queueStaffBufferedAction(
  args: { restaurantName: string; restaurantSlug: string },
  action: StaffBufferedAction
) {
  const current = readStaffBufferedActions(args);
  const next = [...current, action];
  writeStaffBufferedActions(args, next);
  return next;
}

export function removeStaffBufferedAction(
  args: { restaurantName: string; restaurantSlug: string },
  actionId: string
) {
  const current = readStaffBufferedActions(args);
  const next = current.filter((action) => action.id !== actionId);
  writeStaffBufferedActions(args, next);
  return next;
}
