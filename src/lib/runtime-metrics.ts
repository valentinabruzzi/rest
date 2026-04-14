import { createRestaurantIdentityKey } from "@/lib/restaurant-directory";
import type { RuntimeFailureClass } from "@/lib/runtime-resilience";

export type RuntimeMetricsRecord = {
  scope: string;
  successCount: number;
  failureCount: number;
  retryCount: number;
  breakerOpenCount: number;
  bufferedCount: number;
  bufferFlushSuccessCount: number;
  bufferFlushFailureCount: number;
  lastQueueLength: number;
  lastFailureClass: RuntimeFailureClass | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  lastBreakerOpenAt: string | null;
  lastBufferFlushAt: string | null;
  updatedAt: string;
};

type RuntimeMetricEvent =
  | { type: "success"; retries?: number }
  | { type: "failure"; failureClass: RuntimeFailureClass; retries?: number }
  | { type: "breaker_open" }
  | { type: "buffered"; queueLength: number }
  | { type: "buffer_flush_success"; queueLength: number }
  | { type: "buffer_flush_failure"; queueLength: number };

const METRICS_PREFIX = "bb_runtime_metrics_v1";

function getMetricsKey(args: {
  scope: string;
  restaurantName?: string;
  restaurantSlug?: string;
}) {
  const identity =
    args.restaurantName?.trim() || args.restaurantSlug?.trim()
      ? createRestaurantIdentityKey({
          name: args.restaurantName ?? "",
          slug: args.restaurantSlug ?? "",
        })
      : "global";
  return `${METRICS_PREFIX}:${args.scope}:${identity}`;
}

function getDefaultRecord(scope: string): RuntimeMetricsRecord {
  return {
    scope,
    successCount: 0,
    failureCount: 0,
    retryCount: 0,
    breakerOpenCount: 0,
    bufferedCount: 0,
    bufferFlushSuccessCount: 0,
    bufferFlushFailureCount: 0,
    lastQueueLength: 0,
    lastFailureClass: null,
    lastFailureAt: null,
    lastSuccessAt: null,
    lastBreakerOpenAt: null,
    lastBufferFlushAt: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export function readRuntimeMetrics(args: {
  scope: string;
  restaurantName?: string;
  restaurantSlug?: string;
}) {
  if (typeof window === "undefined") return getDefaultRecord(args.scope);

  try {
    const raw = window.localStorage.getItem(getMetricsKey(args));
    if (!raw) return getDefaultRecord(args.scope);
    const parsed = JSON.parse(raw) as Partial<RuntimeMetricsRecord>;
    return {
      ...getDefaultRecord(args.scope),
      ...parsed,
      scope: args.scope,
    };
  } catch {
    return getDefaultRecord(args.scope);
  }
}

export function recordRuntimeMetric(
  args: {
    scope: string;
    restaurantName?: string;
    restaurantSlug?: string;
  },
  event: RuntimeMetricEvent
) {
  if (typeof window === "undefined") return getDefaultRecord(args.scope);

  const current = readRuntimeMetrics(args);
  const nowIso = new Date().toISOString();
  const next: RuntimeMetricsRecord = {
    ...current,
    updatedAt: nowIso,
  };

  if (event.type === "success") {
    next.successCount += 1;
    next.retryCount += Math.max(0, event.retries ?? 0);
    next.lastSuccessAt = nowIso;
  } else if (event.type === "failure") {
    next.failureCount += 1;
    next.retryCount += Math.max(0, event.retries ?? 0);
    next.lastFailureClass = event.failureClass;
    next.lastFailureAt = nowIso;
  } else if (event.type === "breaker_open") {
    next.breakerOpenCount += 1;
    next.lastBreakerOpenAt = nowIso;
  } else if (event.type === "buffered") {
    next.bufferedCount += 1;
    next.lastQueueLength = event.queueLength;
  } else if (event.type === "buffer_flush_success") {
    next.bufferFlushSuccessCount += 1;
    next.lastQueueLength = event.queueLength;
    next.lastBufferFlushAt = nowIso;
  } else if (event.type === "buffer_flush_failure") {
    next.bufferFlushFailureCount += 1;
    next.lastQueueLength = event.queueLength;
    next.lastBufferFlushAt = nowIso;
  }

  window.localStorage.setItem(getMetricsKey(args), JSON.stringify(next));
  return next;
}
