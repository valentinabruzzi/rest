import { createRestaurantIdentityKey } from "@/lib/restaurant-directory";

export type RuntimeFailureClass =
  | "ok"
  | "unauthorized"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "temporary"
  | "network"
  | "unknown";

export type RuntimeCircuitState = {
  state: "closed" | "open" | "half_open";
  consecutiveFailures: number;
  openedAt: string | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
};

export type RuntimeFetchResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string | null;
  failureClass: RuntimeFailureClass;
  attempts: number;
};

export type RuntimeRetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (failureClass: RuntimeFailureClass, status: number) => boolean;
};

export type RuntimeCircuitOptions = {
  threshold?: number;
  cooldownMs?: number;
};

const CIRCUIT_PREFIX = "bb_runtime_circuit_v1";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getRuntimeFailureClass(args: {
  status?: number | null;
  errorMessage?: string | null;
  error?: unknown;
}): RuntimeFailureClass {
  const status = args.status ?? 0;
  const message = (args.errorMessage ??
    (args.error instanceof Error ? args.error.message : "") ??
    "")
    .toLowerCase()
    .trim();

  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 408 || status === 425 || status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "validation";
  if (status >= 500) return "temporary";
  if (
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("timeout") ||
    message.includes("offline") ||
    message.includes("temporarily unavailable") ||
    message.includes("temporary database issue") ||
    message.includes("data transfer quota") ||
    message.includes("database")
  ) {
    return "network";
  }

  return "unknown";
}

export function shouldRetryRuntimeFailure(
  failureClass: RuntimeFailureClass,
  status: number
) {
  if (failureClass === "network" || failureClass === "temporary") return true;
  if (failureClass === "rate_limited") return true;
  return status === 0;
}

export function getRetryDelayMs(attempt: number, args?: RuntimeRetryOptions) {
  const baseDelayMs = args?.baseDelayMs ?? 250;
  const maxDelayMs = args?.maxDelayMs ?? 2500;
  const jitter = 0.85 + Math.random() * 0.3;
  return Math.min(maxDelayMs, Math.round(baseDelayMs * 2 ** (attempt - 1) * jitter));
}

async function parseJsonResponse<T>(res: Response): Promise<T | null> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  return (await res.json().catch(() => null)) as T | null;
}

export async function fetchJsonWithRetry<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: RuntimeRetryOptions
): Promise<RuntimeFetchResult<T>> {
  const attempts = Math.max(1, options?.attempts ?? 3);
  const shouldRetry = options?.shouldRetry ?? shouldRetryRuntimeFailure;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(input, init);
      const data = await parseJsonResponse<T & { error?: string }>(res);
      const errorMessage =
        !res.ok && data && typeof data.error === "string" ? data.error : null;
      const failureClass = getRuntimeFailureClass({
        status: res.status,
        errorMessage,
      });

      if (res.ok) {
        return {
          ok: true,
          status: res.status,
          data,
          errorMessage: null,
          failureClass,
          attempts: attempt,
        };
      }

      if (attempt < attempts && shouldRetry(failureClass, res.status)) {
        await sleep(getRetryDelayMs(attempt, options));
        continue;
      }

      return {
        ok: false,
        status: res.status,
        data,
        errorMessage,
        failureClass,
        attempts: attempt,
      };
    } catch (error) {
      const failureClass = getRuntimeFailureClass({ error });
      if (attempt < attempts && shouldRetry(failureClass, 0)) {
        await sleep(getRetryDelayMs(attempt, options));
        continue;
      }

      return {
        ok: false,
        status: 0,
        data: null,
        errorMessage: error instanceof Error ? error.message : null,
        failureClass,
        attempts: attempt,
      };
    }
  }

  return {
    ok: false,
    status: 0,
    data: null,
    errorMessage: null,
    failureClass: "unknown",
    attempts,
  };
}

export function getRuntimeCircuitKey(args: {
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
  return `${CIRCUIT_PREFIX}:${args.scope}:${identity}`;
}

function getDefaultCircuitState(): RuntimeCircuitState {
  return {
    state: "closed",
    consecutiveFailures: 0,
    openedAt: null,
    lastFailureAt: null,
    lastSuccessAt: null,
  };
}

export function readRuntimeCircuitState(storageKey: string): RuntimeCircuitState {
  if (typeof window === "undefined") return getDefaultCircuitState();

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return getDefaultCircuitState();
    const parsed = JSON.parse(raw) as Partial<RuntimeCircuitState>;
    return {
      state:
        parsed.state === "open" || parsed.state === "half_open"
          ? parsed.state
          : "closed",
      consecutiveFailures:
        typeof parsed.consecutiveFailures === "number" ? parsed.consecutiveFailures : 0,
      openedAt: typeof parsed.openedAt === "string" ? parsed.openedAt : null,
      lastFailureAt:
        typeof parsed.lastFailureAt === "string" ? parsed.lastFailureAt : null,
      lastSuccessAt:
        typeof parsed.lastSuccessAt === "string" ? parsed.lastSuccessAt : null,
    };
  } catch {
    return getDefaultCircuitState();
  }
}

export function writeRuntimeCircuitState(
  storageKey: string,
  state: RuntimeCircuitState
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

export function getRuntimeCircuitMode(
  storageKey: string,
  options?: RuntimeCircuitOptions
) {
  const state = readRuntimeCircuitState(storageKey);
  const cooldownMs = options?.cooldownMs ?? 30000;

  if (state.state !== "open" || !state.openedAt) {
    return {
      state,
      canRequest: true,
      wasCoolingDown: false,
    };
  }

  const openedAtMs = Date.parse(state.openedAt);
  if (!Number.isFinite(openedAtMs)) {
    return {
      state,
      canRequest: true,
      wasCoolingDown: false,
    };
  }

  const now = Date.now();
  if (now - openedAtMs < cooldownMs) {
    return {
      state,
      canRequest: false,
      wasCoolingDown: true,
    };
  }

  const nextState: RuntimeCircuitState = {
    ...state,
    state: "half_open",
  };
  writeRuntimeCircuitState(storageKey, nextState);
  return {
    state: nextState,
    canRequest: true,
    wasCoolingDown: false,
  };
}

export function recordRuntimeCircuitSuccess(storageKey: string) {
  const nextState: RuntimeCircuitState = {
    state: "closed",
    consecutiveFailures: 0,
    openedAt: null,
    lastFailureAt: readRuntimeCircuitState(storageKey).lastFailureAt,
    lastSuccessAt: new Date().toISOString(),
  };
  writeRuntimeCircuitState(storageKey, nextState);
  return nextState;
}

export function recordRuntimeCircuitFailure(
  storageKey: string,
  options?: RuntimeCircuitOptions
) {
  const threshold = Math.max(1, options?.threshold ?? 3);
  const current = readRuntimeCircuitState(storageKey);
  const consecutiveFailures = current.consecutiveFailures + 1;
  const shouldOpen = consecutiveFailures >= threshold;
  const nowIso = new Date().toISOString();
  const nextState: RuntimeCircuitState = {
    state: shouldOpen ? "open" : "closed",
    consecutiveFailures,
    openedAt: shouldOpen ? nowIso : current.openedAt,
    lastFailureAt: nowIso,
    lastSuccessAt: current.lastSuccessAt,
  };
  writeRuntimeCircuitState(storageKey, nextState);
  return nextState;
}
