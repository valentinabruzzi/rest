export const ACTIVE_ORDER_STATUSES = [
  "new",
  "preparing",
  "ready",
  "served",
] as const;

export type ActiveOrderStatus = (typeof ACTIVE_ORDER_STATUSES)[number];
export type ReleasedOrderStatus =
  | "paid"
  | "preparing"
  | "ready"
  | "served"
  | "in_preparation";

const ACTIVE_ORDER_STATUS_SET = new Set<string>(ACTIVE_ORDER_STATUSES);

const LEGACY_STATUS_MAP: Record<string, ActiveOrderStatus> = {
  placed_unpaid: "new",
  paid: "new",
  in_preparation: "preparing",
  sent_to_kitchen: "new",
  preparing: "preparing",
};

const NEXT_ACTIVE_ORDER_STATUS: Record<ActiveOrderStatus, ActiveOrderStatus | null> = {
  new: "preparing",
  preparing: "ready",
  ready: "served",
  served: null,
};

const ORDER_STATUS_LABELS: Record<ActiveOrderStatus, string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
};

const RELEASED_STATUS_FROM_ACTIVE: Record<ActiveOrderStatus, ReleasedOrderStatus> = {
  new: "paid",
  preparing: "preparing",
  ready: "ready",
  served: "served",
};

const PRE_RELEASE_ORDER_STATUS_SET = new Set([
  "draft",
  "placed_unpaid",
  "pending_payment",
]);

const RELEASED_ORDER_STATUS_SET = new Set([
  "paid",
  "new",
  "sent_to_kitchen",
  "in_preparation",
  "preparing",
  "ready",
  "served",
]);

export function normalizeActiveOrderStatus(status: string): ActiveOrderStatus {
  if (ACTIVE_ORDER_STATUS_SET.has(status)) {
    return status as ActiveOrderStatus;
  }

  return LEGACY_STATUS_MAP[status] ?? "new";
}

export function getNextActiveOrderStatus(
  status: string
): ActiveOrderStatus | null {
  const current = normalizeActiveOrderStatus(status);
  return NEXT_ACTIVE_ORDER_STATUS[current];
}

export function getOrderStatusLabel(status: string): string {
  const current = normalizeActiveOrderStatus(status);
  return ORDER_STATUS_LABELS[current];
}

export function getReleasedOrderStatusFromActiveStatus(
  status: ActiveOrderStatus
): ReleasedOrderStatus {
  return RELEASED_STATUS_FROM_ACTIVE[status];
}

export function isPreReleaseOrderStatus(status: string) {
  return PRE_RELEASE_ORDER_STATUS_SET.has(status);
}

export function isReleasedOrderStatus(status: string) {
  return RELEASED_ORDER_STATUS_SET.has(status);
}
