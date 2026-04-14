import type { Prisma } from "@/generated/prisma/client";
import {
  getNextActiveOrderStatus,
  getReleasedOrderStatusFromActiveStatus,
  normalizeActiveOrderStatus,
  type ReleasedOrderStatus,
} from "@/lib/order-status";

export const PREP_STATIONS = ["bar", "kitchen"] as const;
export type PrepStation = (typeof PREP_STATIONS)[number];

export const DASHBOARD_ROLES = [
  "waiter",
  "bar",
  "kitchen",
  "manager",
] as const;
export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export const PREP_STATION_STATUSES = [
  "new",
  "preparing",
  "ready",
  "served",
] as const;
export type PrepStationStatus = (typeof PREP_STATION_STATUSES)[number];

export type StoredPrepStationState = {
  status: PrepStationStatus;
  preparingAt?: string | null;
  readyAt?: string | null;
  servedAt?: string | null;
  updatedAt?: string | null;
};

export type StoredPrepStationMap = Partial<
  Record<PrepStation, StoredPrepStationState>
>;

type StationItemSource = {
  name: string;
  categoryName?: string | null;
  tags?: string[] | null;
};

const BAR_KEYWORDS = [
  "cocktail",
  "drink",
  "drinks",
  "soft drink",
  "soft drinks",
  "bevanda",
  "bevande",
  "wine",
  "vino",
  "beer",
  "birra",
  "coffee",
  "caffe",
  "caf",
  "spritz",
  "aperitivo",
  "aperitivi",
  "liquor",
  "mocktail",
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBarLikeText(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized.length > 0
    ? BAR_KEYWORDS.some((keyword) => normalized.includes(keyword))
    : false;
}

function createStoredStationState(
  status: PrepStationStatus,
  nowIso: string
): StoredPrepStationState {
  return {
    status,
    preparingAt:
      status === "preparing" || status === "ready" || status === "served"
        ? nowIso
        : null,
    readyAt: status === "ready" || status === "served" ? nowIso : null,
    servedAt: status === "served" ? nowIso : null,
    updatedAt: nowIso,
  };
}

function coerceStationStatus(value: unknown): PrepStationStatus | null {
  return typeof value === "string" &&
    (PREP_STATION_STATUSES as readonly string[]).includes(value)
    ? (value as PrepStationStatus)
    : null;
}

function normalizeStoredStationState(
  value: unknown,
  fallbackStatus: PrepStationStatus,
  nowIso: string
): StoredPrepStationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createStoredStationState(fallbackStatus, nowIso);
  }

  const status = coerceStationStatus((value as { status?: unknown }).status);
  if (!status) {
    return createStoredStationState(fallbackStatus, nowIso);
  }

  const state = value as Record<string, unknown>;
  return {
    status,
    preparingAt:
      typeof state.preparingAt === "string" ? state.preparingAt : null,
    readyAt: typeof state.readyAt === "string" ? state.readyAt : null,
    servedAt: typeof state.servedAt === "string" ? state.servedAt : null,
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : nowIso,
  };
}

export function classifyPrepStation({
  name,
  categoryName,
  tags,
}: StationItemSource): PrepStation {
  if (
    isBarLikeText(categoryName) ||
    (tags ?? []).some((tag) => isBarLikeText(tag)) ||
    isBarLikeText(name)
  ) {
    return "bar";
  }

  return "kitchen";
}

export function getRequiredPrepStations(items: StationItemSource[]): PrepStation[] {
  const stations = new Set<PrepStation>();

  for (const item of items) {
    stations.add(classifyPrepStation(item));
  }

  return stations.size > 0 ? [...stations] : ["kitchen"];
}

export function parseStoredPrepStationMap(
  value: Prisma.JsonValue | null | undefined
): StoredPrepStationMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const raw = value as Record<string, unknown>;
  const parsed: StoredPrepStationMap = {};

  for (const station of PREP_STATIONS) {
    const stationState = raw[station];
    if (!stationState || typeof stationState !== "object" || Array.isArray(stationState)) {
      continue;
    }
    const normalized = normalizeStoredStationState(stationState, "new", new Date().toISOString());
    parsed[station] = normalized;
  }

  return parsed;
}

export function ensureStoredPrepStationMap(
  items: StationItemSource[],
  value: Prisma.JsonValue | null | undefined,
  fallbackOrderStatus: string
): StoredPrepStationMap {
  const requiredStations = getRequiredPrepStations(items);
  const parsed = parseStoredPrepStationMap(value);
  const fallbackStatus = normalizeActiveOrderStatus(fallbackOrderStatus);
  const nowIso = new Date().toISOString();
  const next: StoredPrepStationMap = {};

  for (const station of requiredStations) {
    next[station] = normalizeStoredStationState(parsed[station], fallbackStatus, nowIso);
  }

  return next;
}

export function getAggregateOrderStatusFromStations(
  stations: StoredPrepStationMap
): ReleasedOrderStatus {
  const statuses = Object.values(stations).map((station) => station.status);

  if (statuses.length === 0) return "paid";
  if (statuses.every((status) => status === "served")) return "served";
  if (statuses.some((status) => status === "ready")) return "ready";
  if (statuses.some((status) => status === "preparing" || status === "served")) {
    return "preparing";
  }
  return getReleasedOrderStatusFromActiveStatus("new");
}

export function getReadyPrepStations(stations: StoredPrepStationMap): PrepStation[] {
  return PREP_STATIONS.filter((station) => stations[station]?.status === "ready");
}

function transitionStationState(
  current: StoredPrepStationState,
  target: PrepStationStatus,
  nowIso: string
): StoredPrepStationState {
  return {
    status: target,
    preparingAt:
      current.preparingAt ??
      (target === "preparing" || target === "ready" || target === "served"
        ? nowIso
        : null),
    readyAt:
      target === "ready" || target === "served"
        ? current.readyAt ?? nowIso
        : null,
    servedAt: target === "served" ? current.servedAt ?? nowIso : null,
    updatedAt: nowIso,
  };
}

export function advanceSinglePrepStation(
  stations: StoredPrepStationMap,
  station: PrepStation,
  target: Extract<PrepStationStatus, "preparing" | "ready" | "served">
): StoredPrepStationMap | null {
  const current = stations[station];
  if (!current) return null;

  const expected = getNextActiveOrderStatus(current.status);
  if (expected !== target) return null;

  const nowIso = new Date().toISOString();
  return {
    ...stations,
    [station]: transitionStationState(current, target, nowIso),
  };
}

export function applyManagerTransition(
  stations: StoredPrepStationMap,
  target: Extract<PrepStationStatus, "preparing" | "ready" | "served">
): StoredPrepStationMap | null {
  const current = getAggregateOrderStatusFromStations(stations);
  if (getNextActiveOrderStatus(current) !== target) return null;

  const nowIso = new Date().toISOString();
  const next: StoredPrepStationMap = {};

  for (const station of PREP_STATIONS) {
    const currentState = stations[station];
    if (!currentState) continue;

    if (target === "preparing") {
      next[station] =
        currentState.status === "new"
          ? transitionStationState(currentState, "preparing", nowIso)
          : currentState;
      continue;
    }

    if (target === "ready") {
      next[station] =
        currentState.status === "served"
          ? currentState
          : transitionStationState(currentState, "ready", nowIso);
      continue;
    }

    next[station] = transitionStationState(currentState, "served", nowIso);
  }

  return next;
}

export function applyWaiterServedTransition(
  stations: StoredPrepStationMap
): StoredPrepStationMap | null {
  const readyStations = getReadyPrepStations(stations);
  if (readyStations.length === 0) return null;

  const nowIso = new Date().toISOString();
  const next: StoredPrepStationMap = { ...stations };

  for (const station of readyStations) {
    const currentState = stations[station];
    if (!currentState) continue;
    next[station] = transitionStationState(currentState, "served", nowIso);
  }

  return next;
}

export function getRoleLabel(role: DashboardRole) {
  if (role === "waiter") return "Cameriere";
  if (role === "bar") return "Bar";
  if (role === "kitchen") return "Kitchen";
  return "Responsabile";
}
