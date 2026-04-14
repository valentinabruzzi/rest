"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { normalizeActiveOrderStatus } from "@/lib/order-status";
import {
  getRestaurantBranding,
  getRestaurantFontFamily,
  getRestaurantInterfaceSettings,
} from "@/lib/restaurant-branding";
import { StaffAnalyticsPanel } from "@/components/staff/staff-analytics-panel";
import { StaffAvailabilityPanel } from "@/components/staff/staff-availability-panel";
import { StaffMenuPanel } from "@/components/staff/staff-menu-panel";
import { StaffPinPanel } from "@/components/staff/staff-pin-panel";
import { StaffInfoBadge } from "@/components/staff/staff-info-badge";
import { StaffOrderTakingPanel } from "@/components/staff/staff-order-taking-panel";
import {
  advanceSinglePrepStation,
  applyManagerTransition,
  applyWaiterServedTransition,
  type DashboardRole,
  ensureStoredPrepStationMap,
  getAggregateOrderStatusFromStations,
  getReadyPrepStations,
  type PrepStation,
  type PrepStationStatus,
} from "@/lib/order-stations";
import {
  getRewardCopy,
} from "@/lib/customer-i18n";
import type {
  StaffMenuCategoryRow,
  StaffMenuItemRow,
  StaffOrderRowData,
  StaffServedRange,
  StaffTableRow,
} from "@/lib/staff-view-data";
import {
  getRestaurantStaffAccess,
  isValidRolePin,
  mergeRestaurantStaffAccess,
  normalizeStaffPin,
  type StaffRolePins,
} from "@/lib/staff-access";
import {
  createStaffBufferedActionId,
  queueStaffBufferedAction,
  readStaffBufferedActions,
  removeStaffBufferedAction,
  type StaffBufferedAction,
  type StaffBufferedCreateOrderItem,
  type StaffBufferedPaymentLocation,
  type StaffBufferedPaymentMethod,
  type StaffBufferedPaymentStatus,
  type StaffBufferedRequestStatus,
  type StaffBufferedUiLanguage,
} from "@/lib/staff-buffer";
import { recordRuntimeMetric } from "@/lib/runtime-metrics";
import {
  fetchJsonWithRetry,
  getRuntimeCircuitKey,
  getRuntimeCircuitMode,
  recordRuntimeCircuitFailure,
  recordRuntimeCircuitSuccess,
} from "@/lib/runtime-resilience";
import type { StaffAnalyticsPayload } from "@/types/staff-analytics";
import type { MenuCategory } from "@/types/menu";
import type {
  StaffRequestKind,
  StaffRequestOption,
  StaffRequestSummary,
  StaffRequestStatus,
} from "@/types/staff-request";
import type { OrderColumn } from "@/types/staff-orders";
import type { RewardPrizeType } from "@/types/reward";

type StaffTab =
  | "orders"
  | "payments"
  | "requests"
  | "pins"
  | "availability"
  | "analytics"
  | "rewards"
  | "menu";
type RequestColumn = "new" | "in_progress" | "closed";
type RequestListFilter = "open" | RequestColumn;
type WaiterFlow = "assistance" | "payments" | "new_order" | "ready";
type StationFlow = Extract<PrepStationStatus, "new" | "preparing" | "ready" | "served">;
type OrderTransitionStatus = Extract<OrderColumn, "preparing" | "ready" | "served">;
type StationColumnConfig = {
  id: StationFlow;
  nextStatus: Extract<PrepStationStatus, "preparing" | "ready"> | null;
};

type RoleSessionState = {
  restaurantName: string;
  restaurantSlug: string;
  role: DashboardRole;
  language: StaffUiLanguage;
  deviceLabel: string;
};

type StaffUiLanguage = "it" | "en";
type StaffRuntimeMode = "normal" | "temporary";

type OrderRow = StaffOrderRowData;

type RewardVerificationResult = {
  state: "valid" | "already_redeemed" | "expired";
  reward: {
    id: string;
    code: string | null;
    prizeType: RewardPrizeType;
    title: string;
    description: string;
    issuedAt: string;
    expiresAt: string;
    redeemedAt: string | null;
    currentStatus: string;
  };
  order: {
    orderId: string;
    orderNumber: string;
    tableNumber: string;
    restaurantName: string;
  };
};

const ORDER_COLUMNS: Array<{
  id: OrderColumn;
  nextStatus: OrderTransitionStatus | null;
}> = [
  { id: "new", nextStatus: "preparing" },
  { id: "preparing", nextStatus: "ready" },
  { id: "ready", nextStatus: "served" },
  { id: "served", nextStatus: null },
];

const REQUEST_COLUMNS: Array<{ id: RequestColumn }> = [
  { id: "new" },
  { id: "in_progress" },
  { id: "closed" },
];

const ROLE_STORAGE_KEY = "bb_staff_role_session_v2";
const DASHBOARD_CACHE_PREFIX = "bb_staff_dashboard_cache_v1";
const STAFF_RUNTIME_POLL_MS = 10000;
const STAFF_RUNTIME_TEMPORARY_POLL_MS = 25000;
const STAFF_RUNTIME_HEALTH_MS = 15000;

const ROLE_OPTIONS: Array<{
  id: DashboardRole;
}> = [
  { id: "waiter" },
  { id: "bar" },
  { id: "kitchen" },
  { id: "manager" },
];

const STATION_COLUMNS: StationColumnConfig[] = [
  { id: "new", nextStatus: "preparing" },
  { id: "preparing", nextStatus: "ready" },
  { id: "ready", nextStatus: null },
];

const KITCHEN_STATION_COLUMNS: StationColumnConfig[] = [
  ...STATION_COLUMNS,
  { id: "served", nextStatus: null },
];

const REQUEST_GROUPS: StaffRequestKind[] = ["payment_request", "table_assistance"];

const PREVIEW_TIMESTAMP = "2026-01-01T12:00:00.000Z";
const ADMIN_PREVIEW_HYDRATED_EVENT = "bb-admin-preview-hydrated";
const SERVED_RANGE_OPTIONS: StaffServedRange[] = [
  "hour",
  "today",
  "week",
  "month",
  "year",
];

type BarcodeDetectorLike = new (options?: {
  formats?: string[];
}) => {
  detect(
    source: ImageBitmapSource
  ): Promise<Array<{ rawValue?: string | null }>>;
};

type StaffDashboardCacheRecord = {
  savedAt: string;
  orders: StaffOrderRowData[];
  requests: StaffRequestSummary[];
};

function getDashboardCacheKey(args: {
  restaurantName: string;
  restaurantSlug: string;
  servedRange: StaffServedRange;
}) {
  return [
    DASHBOARD_CACHE_PREFIX,
    encodeURIComponent(args.restaurantSlug.trim().toLowerCase()),
    encodeURIComponent(args.restaurantName.trim().toLowerCase()),
    args.servedRange,
  ].join(":");
}

function parseDashboardCache(raw: string | null): StaffDashboardCacheRecord | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StaffDashboardCacheRecord>;
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.requests)) {
      return null;
    }

    return {
      savedAt:
        typeof parsed.savedAt === "string"
          ? parsed.savedAt
          : new Date(0).toISOString(),
      orders: parsed.orders as StaffOrderRowData[],
      requests: parsed.requests as StaffRequestSummary[],
    };
  } catch {
    return null;
  }
}

export function StaffBoard({
  restaurantName,
  restaurantSlug,
  logoUrl,
  primaryColor,
  secondaryColor,
  theme,
  settings,
  preview = false,
  initialOrders = [],
  initialRequests = [],
  initialDashboardLoaded = false,
  initialMenuCategories = [],
  initialMenuItems = [],
  initialMenuEditorLoaded = false,
  initialOrderTakingTables = [],
  initialOrderTakingCategories = [],
  initialOrderTakingCurrency = "EUR",
  initialOrderTakingServiceFeePercent = 0,
  initialOrderTakingLoaded = false,
  initialAnalyticsData = null,
  initialAnalyticsLoaded = false,
}: {
  restaurantName: string;
  restaurantSlug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  theme: unknown | null;
  settings: unknown | null;
  preview?: boolean;
  initialOrders?: StaffOrderRowData[];
  initialRequests?: StaffRequestSummary[];
  initialDashboardLoaded?: boolean;
  initialMenuCategories?: StaffMenuCategoryRow[];
  initialMenuItems?: StaffMenuItemRow[];
  initialMenuEditorLoaded?: boolean;
  initialOrderTakingTables?: StaffTableRow[];
  initialOrderTakingCategories?: MenuCategory[];
  initialOrderTakingCurrency?: string;
  initialOrderTakingServiceFeePercent?: number;
  initialOrderTakingLoaded?: boolean;
  initialAnalyticsData?: StaffAnalyticsPayload | null;
  initialAnalyticsLoaded?: boolean;
}) {
  const router = useRouter();
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const ordersRef = useRef<OrderRow[]>(initialOrders);
  const requestsRef = useRef<StaffRequestSummary[]>(initialRequests);
  const [restaurantSettings, setRestaurantSettings] = useState<unknown | null>(settings);
  const branding = useMemo(
    () => getRestaurantBranding(theme, restaurantSettings),
    [restaurantSettings, theme]
  );
  const interfaceSettings = useMemo(
    () => getRestaurantInterfaceSettings(restaurantSettings),
    [restaurantSettings]
  );
  const defaultStaffLanguage: StaffUiLanguage =
    interfaceSettings.defaultLanguage === "en" ? "en" : "it";
  const staffAccess = useMemo(
    () => getRestaurantStaffAccess(restaurantSettings),
    [restaurantSettings]
  );
  const [activeTab, setActiveTab] = useState<StaffTab>("orders");
  const [waiterFlow, setWaiterFlow] = useState<WaiterFlow>("assistance");
  const [stationFlow, setStationFlow] = useState<StationFlow>("new");
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [requests, setRequests] = useState<StaffRequestSummary[]>(
    initialRequests
  );
  const [orderTakingTables, setOrderTakingTables] =
    useState<StaffTableRow[]>(initialOrderTakingTables);
  const [orderTakingCategories, setOrderTakingCategories] =
    useState<MenuCategory[]>(initialOrderTakingCategories);
  const [orderTakingCurrency, setOrderTakingCurrency] = useState(
    initialOrderTakingCurrency
  );
  const [orderTakingServiceFeePercent, setOrderTakingServiceFeePercent] = useState(
    initialOrderTakingServiceFeePercent
  );
  const [orderTakingLoaded, setOrderTakingLoaded] = useState(initialOrderTakingLoaded);
  const [menuCategories, setMenuCategories] =
    useState<StaffMenuCategoryRow[]>(initialMenuCategories);
  const [menuItems, setMenuItems] = useState<StaffMenuItemRow[]>(initialMenuItems);
  const [menuEditorLoaded, setMenuEditorLoaded] = useState(initialMenuEditorLoaded);
  const [analyticsData, setAnalyticsData] = useState<StaffAnalyticsPayload | null>(
    initialAnalyticsData
  );
  const [analyticsLoaded, setAnalyticsLoaded] = useState(initialAnalyticsLoaded);
  const [loading, setLoading] = useState(!preview && !initialDashboardLoaded);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<StaffRuntimeMode>("normal");
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const [bufferedActions, setBufferedActions] = useState<StaffBufferedAction[]>([]);
  const [bufferFlushBusy, setBufferFlushBusy] = useState(false);
  const [tableFilter, setTableFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [requestListFilter, setRequestListFilter] =
    useState<RequestListFilter>("open");
  const [requestGroupFilter, setRequestGroupFilter] =
    useState<StaffRequestKind>("table_assistance");
  const [servedRange, setServedRange] = useState<StaffServedRange>("today");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [markingPaidOrderId, setMarkingPaidOrderId] = useState<string | null>(null);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [rewardCode, setRewardCode] = useState("");
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [rewardBusy, setRewardBusy] = useState(false);
  const [rewardResult, setRewardResult] =
    useState<RewardVerificationResult | null>(null);
  const [roleSessionReady, setRoleSessionReady] = useState(preview);
  const [roleSession, setRoleSession] = useState<RoleSessionState | null>(
    preview
      ? {
          restaurantName,
          restaurantSlug,
          role: "manager",
          language: defaultStaffLanguage,
          deviceLabel: "",
        }
      : null
  );
  const [roleDraft, setRoleDraft] = useState<DashboardRole>("waiter");
  const [deviceLabelDraft, setDeviceLabelDraft] = useState("");
  const [languageDraft, setLanguageDraft] = useState<StaffUiLanguage>(
    defaultStaffLanguage
  );
  const [pinDraft, setPinDraft] = useState("");
  const [roleAccessError, setRoleAccessError] = useState<string | null>(null);
  const headingColor = branding.headingTextColor;
  const bodyColor = branding.bodyTextColor;
  const currentLanguage = roleSession?.language ?? languageDraft;
  const locale = currentLanguage === "en" ? "en-US" : "it-IT";
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale]
  );
  const longFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale]
  );
  const activeRole: DashboardRole | null = preview
    ? "manager"
    : roleSession?.role ?? null;
  const initializedRoleRef = useRef<DashboardRole | null>(activeRole);

  const t = useCallback(
    (it: string, en: string) => (currentLanguage === "en" ? en : it),
    [currentLanguage]
  );

  const readDashboardCache = useCallback(
    (range: StaffServedRange) => {
      if (preview || typeof window === "undefined") return null;
      return parseDashboardCache(
        window.localStorage.getItem(
          getDashboardCacheKey({
            restaurantName,
            restaurantSlug,
            servedRange: range,
          })
        )
      );
    },
    [preview, restaurantName, restaurantSlug]
  );

  const writeDashboardCache = useCallback(
    (
      range: StaffServedRange,
      nextOrders: StaffOrderRowData[],
      nextRequests: StaffRequestSummary[]
    ) => {
      if (preview || typeof window === "undefined") return;
      window.localStorage.setItem(
        getDashboardCacheKey({
          restaurantName,
          restaurantSlug,
          servedRange: range,
        }),
        JSON.stringify({
          savedAt: new Date().toISOString(),
          orders: nextOrders,
          requests: nextRequests,
        } satisfies StaffDashboardCacheRecord)
      );
    },
    [preview, restaurantName, restaurantSlug]
  );

  const restaurantIdentity = useMemo(
    () => ({
      restaurantName,
      restaurantSlug,
    }),
    [restaurantName, restaurantSlug]
  );
  const dashboardMetricsScope = useMemo(
    () => ({
      scope: "staff-dashboard" as const,
      restaurantName,
      restaurantSlug,
    }),
    [restaurantName, restaurantSlug]
  );
  const outboxMetricsScope = useMemo(
    () => ({
      scope: "staff-outbox" as const,
      restaurantName,
      restaurantSlug,
    }),
    [restaurantName, restaurantSlug]
  );
  const runtimeHealthMetricsScope = useMemo(
    () => ({
      scope: "staff-runtime-health" as const,
      restaurantName,
      restaurantSlug,
    }),
    [restaurantName, restaurantSlug]
  );
  const dashboardCircuitKey = useMemo(
    () =>
      getRuntimeCircuitKey({
        scope: "staff-dashboard-read",
        restaurantName,
        restaurantSlug,
      }),
    [restaurantName, restaurantSlug]
  );
  const runtimeHealthCircuitKey = useMemo(
    () =>
      getRuntimeCircuitKey({
        scope: "staff-network-status",
        restaurantName,
        restaurantSlug,
      }),
    [restaurantName, restaurantSlug]
  );

  const syncBufferedActions = useCallback(() => {
    if (preview) {
      setBufferedActions([]);
      return [] as StaffBufferedAction[];
    }

    const next = readStaffBufferedActions(restaurantIdentity);
    setBufferedActions(next);
    return next;
  }, [preview, restaurantIdentity]);

  const enterTemporaryMode = useCallback(
    (message?: string) => {
      if (preview) return;
      setRuntimeMode("temporary");
      setRuntimeNotice(
        message ??
          t(
            "Modalita temporanea attiva. Salvo le azioni sul dispositivo e le invio appena rete e database tornano disponibili.",
            "Temporary mode is active. Actions are being saved on this device and will be sent as soon as the network and database are available again."
          )
      );
    },
    [preview, t]
  );

  const leaveTemporaryMode = useCallback(() => {
    if (preview) return;
    setRuntimeMode("normal");
    setRuntimeNotice(null);
  }, [preview]);

  const isTemporaryResponseStatus = useCallback(
    (status: number) => status === 408 || status === 425 || status === 429 || status >= 500,
    []
  );

  const isBufferedConflictResolved = useCallback(
    (action: StaffBufferedAction, errorMessage: string | null | undefined) => {
      const message = (errorMessage ?? "").toLowerCase();

      if (action.kind === "order-status") {
        return message.includes("invalid status transition");
      }

      if (action.kind === "mark-paid") {
        return message.includes("already paid");
      }

      if (action.kind === "request-status") {
        return message.includes("invalid request transition");
      }

      return false;
    },
    []
  );

  const createBufferedCreateOrderPayload = useCallback(
    (args: {
      tableId: string;
      language: StaffBufferedUiLanguage;
      paymentLocation: StaffBufferedPaymentLocation;
      paymentMethod: StaffBufferedPaymentMethod;
      items: StaffBufferedCreateOrderItem[];
    }) => ({
      tableId: args.tableId,
      language: args.language,
      paymentLocation: args.paymentLocation,
      paymentMethod: args.paymentMethod,
      items: args.items,
      clientMutationId: createStaffBufferedActionId(),
    }),
    []
  );

  function ensureOrderStations(order: OrderRow) {
    if (Object.keys(order.stationStatus).length > 0) {
      return order.stationStatus;
    }

    const nowIso = new Date().toISOString();
    const next = {
      bar: order.items.some((item) => item.station === "bar")
        ? { status: "new" as const, updatedAt: nowIso }
        : undefined,
      kitchen: order.items.some((item) => item.station === "kitchen")
        ? { status: "new" as const, updatedAt: nowIso }
        : undefined,
    };

    return next;
  }

  function applyBufferedOrderStatusLocally(
    id: string,
    status: OrderTransitionStatus,
    actor: DashboardRole
  ) {
    setOrders((current) =>
      current.map((order) => {
        if (order.id !== id) return order;

        const baseStations = ensureOrderStations(order);
        const nextStations =
          actor === "manager"
            ? applyManagerTransition(baseStations, status)
            : actor === "waiter"
              ? status === "served"
                ? applyWaiterServedTransition(baseStations)
                : null
              : advanceSinglePrepStation(baseStations, actor as PrepStation, status);

        if (!nextStations) return order;

        const aggregateStatus = normalizeActiveOrderStatus(
          getAggregateOrderStatusFromStations(nextStations)
        );

        return {
          ...order,
          status: aggregateStatus,
          rawStatus: aggregateStatus,
          stationStatus: nextStations,
          readyStations: getReadyPrepStations(nextStations),
          servedAt:
            aggregateStatus === "served"
              ? order.servedAt ?? new Date().toISOString()
              : order.servedAt,
        };
      })
    );
  }

  function applyBufferedMarkPaidLocally(
    id: string,
    paymentStatus: StaffBufferedPaymentStatus,
    actor: Extract<DashboardRole, "manager" | "waiter">,
    actorLabel: string | null
  ) {
    const paidAtIso = new Date().toISOString();
    setOrders((current) =>
      current.map((order) => {
        if (order.id !== id) return order;

        const nextStations = ensureStoredPrepStationMap(
          order.items.map((item) => ({
            name: item.name,
            categoryName: item.categoryName,
            tags: [item.station],
          })),
          order.stationStatus,
          "paid"
        );

        return {
          ...order,
          rawStatus: "paid",
          status: normalizeActiveOrderStatus(
            getAggregateOrderStatusFromStations(nextStations)
          ),
          stationStatus: nextStations,
          readyStations: getReadyPrepStations(nextStations),
          paymentStatus,
          paymentReleased: true,
          pendingPaymentFlow: null,
          pendingPaymentMethod: "",
          paymentMarkedByRole: actor,
          paymentMarkedByLabel: actorLabel,
          paidAt: paidAtIso,
        };
      })
    );
    setRequests((current) =>
      current.map((request) =>
        request.orderId === id && request.kind === "payment_request" && request.status !== "closed"
          ? {
              ...request,
              status: "closed",
              updatedAt: paidAtIso,
              closedAt: paidAtIso,
            }
          : request
      )
    );
  }

  function applyBufferedRequestStatusLocally(
    id: string,
    status: StaffBufferedRequestStatus | StaffRequestStatus
  ) {
    const nowIso = new Date().toISOString();
    setRequests((current) =>
      current.map((request) =>
        request.id === id
          ? {
              ...request,
              status,
              updatedAt: nowIso,
              closedAt: status === "closed" ? nowIso : null,
            }
          : request
      )
    );
  }

  const queueBufferedAction = useCallback(
    (action: StaffBufferedAction) => {
      if (preview) return false;

      const next = queueStaffBufferedAction(restaurantIdentity, action);
      setBufferedActions(next);
      recordRuntimeMetric(outboxMetricsScope, { type: "buffered", queueLength: next.length });
      enterTemporaryMode();
      setActionError(null);
      return true;
    },
    [enterTemporaryMode, outboxMetricsScope, preview, restaurantIdentity]
  );

  useEffect(() => {
    setRestaurantSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (preview) {
      setRuntimeMode("normal");
      setRuntimeNotice(null);
      setBufferedActions([]);
      return;
    }

    syncBufferedActions();
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enterTemporaryMode(
        t(
          "Rete non disponibile. Le prossime azioni verranno salvate sul dispositivo.",
          "Network unavailable. The next actions will be saved on this device."
        )
      );
    }
  }, [enterTemporaryMode, preview, syncBufferedActions, t]);

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  useEffect(() => {
    if (preview || !initialDashboardLoaded) return;
    writeDashboardCache("today", initialOrders, initialRequests);
  }, [
    initialDashboardLoaded,
    initialOrders,
    initialRequests,
    preview,
    writeDashboardCache,
  ]);

  function getRoleLabel(role: DashboardRole) {
    if (role === "waiter") return t("Cameriere", "Waiter");
    if (role === "bar") return "Bar";
    if (role === "kitchen") return "Kitchen";
    return t("Responsabile", "Manager");
  }

  function getRoleDescription(role: DashboardRole) {
    if (role === "waiter") {
      return t(
        "ordini pronti da portare e richieste al tavolo",
        "ready orders to serve and table requests"
      );
    }
    if (role === "bar") {
      return t(
        "preparazione cocktail e bevande",
        "cocktails and drinks preparation"
      );
    }
    if (role === "kitchen") {
      return t("preparazione piatti", "food preparation");
    }
    return t(
      "dashboard completa con controllo generale",
      "full dashboard with overall control"
    );
  }

  function getManagerTabLabel(tab: StaffTab) {
    if (tab === "orders") return t("Ordini", "Orders");
    if (tab === "payments") return t("Pagamenti", "Payments");
    if (tab === "requests") return t("Richieste staff", "Staff requests");
    if (tab === "pins") return "PIN";
    if (tab === "availability") return t("Radar Piatti", "Dish Radar");
    if (tab === "analytics") return t("Analisi", "Analytics");
    if (tab === "rewards") return t("Premi", "Rewards");
    return "Menu";
  }

  function getOrderColumnTitle(column: OrderColumn) {
    if (column === "new") return t("Nuovi", "New");
    if (column === "preparing") return t("In preparazione", "Preparing");
    if (column === "ready") return t("Pronti", "Ready");
    return t("Serviti", "Served");
  }

  function getOrderColumnAction(column: OrderColumn) {
    if (column === "new") return t("Avvia preparazione", "Start preparing");
    if (column === "preparing") return t("Segna pronto", "Mark ready");
    if (column === "ready") return t("Segna servito", "Mark served");
    return null;
  }

  function getServedRangeLabel(range: StaffServedRange) {
    if (range === "hour") return t("1h", "1h");
    if (range === "today") return t("Oggi", "Today");
    if (range === "week") return t("7g", "7d");
    if (range === "month") return t("30g", "30d");
    return t("1 anno", "1 year");
  }

  function getRequestColumnTitle(column: RequestColumn) {
    if (column === "new") return t("Nuove", "New");
    if (column === "in_progress") return t("In corso", "In progress");
    return t("Chiuse", "Closed");
  }

  function getRequestListFilterLabel(filter: RequestListFilter) {
    if (filter === "open") return t("Aperte", "Open");
    if (filter === "new") return t("Nuove", "New");
    if (filter === "in_progress") return t("In corso", "In progress");
    return t("Chiuse", "Closed");
  }

  function getStationColumnTitle(column: StationFlow) {
    if (column === "new") return t("Nuovi", "New");
    if (column === "preparing") return t("In preparazione", "Preparing");
    if (column === "ready") return t("Pronti", "Ready");
    return t("Serviti", "Served");
  }

  function getStationColumnAction(column: StationFlow) {
    if (column === "new") return t("In preparazione", "Preparing");
    if (column === "preparing") return t("Pronto", "Ready");
    return null;
  }

  function getRequestTypeLabel(
    requestType: StaffRequestOption | null,
    kind: StaffRequestKind
  ) {
    if (kind === "payment_request") {
      if (requestType === "payment_counter") return t("Cassa", "Counter");
      if (requestType === "payment_card") return t("Carta tavolo", "Table card");
      if (requestType === "payment_cash")
        return t("Contanti tavolo", "Table cash");
      return t("Pagamento", "Payment");
    }
    return t("Assistenza", "Assistance");
  }

  function getRequestGroupTitle(kind: StaffRequestKind) {
    return kind === "payment_request"
      ? t("Pagamenti tavolo / cassa", "Table / cash payments")
      : t("Assistenza tavolo", "Table assistance");
  }

  function getRewardStatusLabel(state: RewardVerificationResult["state"]) {
    if (state === "valid") return t("Valido", "Valid");
    if (state === "already_redeemed") return t("Gia riscattato", "Already redeemed");
    return t("Scaduto", "Expired");
  }

  const localizedRewardCopy = useMemo(
    () =>
      rewardResult
        ? getRewardCopy(rewardResult.reward.prizeType, currentLanguage)
        : null,
    [currentLanguage, rewardResult]
  );

  useEffect(() => {
    if (!preview) return;
    document.body.dataset.adminPreviewHydrated = "true";
    window.dispatchEvent(new Event(ADMIN_PREVIEW_HYDRATED_EVENT));

    return () => {
      delete document.body.dataset.adminPreviewHydrated;
    };
  }, [preview]);

  const previewOrders = useMemo<OrderRow[]>(
    () => [
      {
        id: "preview-order-1",
        orderNumber: "PREVIEW-01",
        status: "new",
        rawStatus: "paid",
        stationStatus: {
          bar: { status: "new", updatedAt: PREVIEW_TIMESTAMP },
          kitchen: { status: "new", updatedAt: PREVIEW_TIMESTAMP },
        },
        readyStations: [],
        paymentStatus: "paid_online",
        paymentReleased: true,
        pendingPaymentFlow: null,
        pendingPaymentMethod: "Nessuna attesa",
        requestedPaymentMethod: null,
        paymentMarkedByRole: "system",
        paymentMarkedByLabel: null,
        paidAt: PREVIEW_TIMESTAMP,
        servedAt: null,
        total: 2600,
        tableNumber: "12",
        restaurantName,
        createdAt: PREVIEW_TIMESTAMP,
        customerNote: "Preview order",
        items: [
          {
            id: "preview-item-1",
            name: "Spritz",
            quantity: 2,
            lineTotal: 1800,
            selectedNotes: [],
            notes: "Poco ghiaccio",
            selectedOptions: [],
            station: "bar",
            categoryName: "Cocktail",
          },
          {
            id: "preview-item-2",
            name: "Tagliere",
            quantity: 1,
            lineTotal: 800,
            selectedNotes: [],
            notes: null,
            selectedOptions: [],
            station: "kitchen",
            categoryName: "Food",
          },
        ],
      },
    ],
    [restaurantName]
  );
  const previewRequests = useMemo<StaffRequestSummary[]>(
    () => [
      {
        id: "preview-request-1",
        type: "waiter_call",
        kind: "table_assistance",
        requestType: "assistance",
        requestTypeLabel: "assistance",
        title: "Richiesta cameriere",
        detail: "Preview: assistenza al tavolo",
        note: "Preview mode",
        status: "new",
        createdAt: PREVIEW_TIMESTAMP,
        updatedAt: PREVIEW_TIMESTAMP,
        closedAt: null,
        restaurantName,
        tableNumber: "12",
        orderId: "preview-order-1",
        orderNumber: "PREVIEW-01",
      },
    ],
    [restaurantName]
  );

  useEffect(() => {
    if (preview) return;

    try {
      const raw = window.localStorage.getItem(ROLE_STORAGE_KEY);
      if (!raw) {
        setRoleSessionReady(true);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<RoleSessionState>;
      const nextRole =
        parsed.role === "waiter" ||
        parsed.role === "bar" ||
        parsed.role === "kitchen" ||
        parsed.role === "manager"
          ? parsed.role
          : null;

      if (
        !nextRole ||
        parsed.restaurantSlug !== restaurantSlug ||
        (typeof parsed.restaurantName === "string" &&
          parsed.restaurantName !== restaurantName)
      ) {
        window.localStorage.removeItem(ROLE_STORAGE_KEY);
        setRoleSessionReady(true);
        return;
      }

      const nextSession: RoleSessionState = {
        restaurantName,
        restaurantSlug,
        role: nextRole,
        language:
          parsed.language === "en" || parsed.language === "it"
            ? parsed.language
            : defaultStaffLanguage,
        deviceLabel:
          typeof parsed.deviceLabel === "string" ? parsed.deviceLabel : "",
      };
      setRoleSession(nextSession);
      setRoleDraft(nextSession.role);
      setLanguageDraft(nextSession.language);
      setDeviceLabelDraft(nextSession.deviceLabel);
    } catch {
      window.localStorage.removeItem(ROLE_STORAGE_KEY);
    } finally {
      setRoleSessionReady(true);
    }
  }, [defaultStaffLanguage, preview, restaurantName, restaurantSlug]);

  function applyRoleSession(
    nextRole: DashboardRole,
    nextLanguage: StaffUiLanguage,
    nextDeviceLabel: string
  ) {
    const normalizedPin = normalizeStaffPin(pinDraft);
    if (!normalizedPin) {
      setRoleAccessError(t("Inserisci il PIN del ruolo.", "Enter the role PIN."));
      return;
    }
    if (staffAccess.rolePins[nextRole].length === 0) {
      setRoleAccessError(
        t(
          "Nessun PIN configurato in admin per questo ruolo.",
          "No admin PIN is configured for this role."
        )
      );
      return;
    }
    if (
      !isValidRolePin({
        settings: restaurantSettings,
        role: nextRole,
        pin: normalizedPin,
      })
    ) {
      setRoleAccessError(
        t(
          "PIN non valido per il ruolo selezionato.",
          "Invalid PIN for the selected role."
        )
      );
      return;
    }

    const nextSession: RoleSessionState = {
      restaurantName,
      restaurantSlug,
      role: nextRole,
      language: nextLanguage,
      deviceLabel: nextDeviceLabel.trim(),
    };
    setRoleSession(nextSession);
    setRoleDraft(nextRole);
    setLanguageDraft(nextLanguage);
    setDeviceLabelDraft(nextSession.deviceLabel);
    setPinDraft("");
    setRoleAccessError(null);
    window.localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(nextSession));
  }

  function clearRoleSession() {
    setRoleSession(null);
    setRoleDraft("waiter");
    setLanguageDraft(defaultStaffLanguage);
    setDeviceLabelDraft("");
    setPinDraft("");
    setRoleAccessError(null);
    window.localStorage.removeItem(ROLE_STORAGE_KEY);
  }

  function updateStaffLanguage(nextLanguage: StaffUiLanguage) {
    if (preview) {
      setRoleSession((current) =>
        current
          ? { ...current, language: nextLanguage }
          : {
              restaurantName,
              restaurantSlug,
              role: "manager",
              language: nextLanguage,
              deviceLabel: "",
            }
      );
      setLanguageDraft(nextLanguage);
      return;
    }

    if (roleSession) {
      const nextSession = {
        ...roleSession,
        language: nextLanguage,
      };
      setRoleSession(nextSession);
      setLanguageDraft(nextLanguage);
      window.localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(nextSession));
      return;
    }

    setLanguageDraft(nextLanguage);
    setRoleAccessError(null);
  }

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (preview) return;
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    try {
      const dashboardCircuit = getRuntimeCircuitMode(dashboardCircuitKey);
      const ordersUrl = `/api/staff/orders?servedRange=${servedRange}`;
      const cached = readDashboardCache(servedRange);
      const currentOrders = ordersRef.current;
      const currentRequests = requestsRef.current;

      if (!dashboardCircuit.canRequest) {
        const nextOrders = cached?.orders ?? currentOrders;
        const nextRequests = cached?.requests ?? currentRequests;
        setOrders(nextOrders);
        setRequests(nextRequests);
        enterTemporaryMode(
          t(
            "Circuit breaker attivo. Sto mostrando i dati salvati sul dispositivo.",
            "Circuit breaker is active. Showing the data saved on this device."
          )
        );
        setLoadError(
          t(
            "Circuit breaker attivo. Sto mostrando i dati salvati sul dispositivo.",
            "Circuit breaker is active. Showing the data saved on this device."
          )
        );
        return;
      }

      const [ordersResult, requestsResult] = await Promise.all([
        fetchJsonWithRetry<{ orders?: StaffOrderRowData[] }>(ordersUrl, undefined, {
          attempts: 3,
        }),
        fetchJsonWithRetry<{ requests?: StaffRequestSummary[] }>(
          "/api/staff/requests",
          undefined,
          { attempts: 3 }
        ),
      ]);

      if (ordersResult.status === 401 || requestsResult.status === 401) {
        router.push("/staff/login");
        return;
      }

      const degraded = !ordersResult.ok || !requestsResult.ok;

      if (degraded) {
        recordRuntimeMetric(dashboardMetricsScope, {
          type: "failure",
          failureClass: !ordersResult.ok
            ? ordersResult.failureClass
            : requestsResult.failureClass,
          retries:
            Math.max(0, ordersResult.attempts - 1) +
            Math.max(0, requestsResult.attempts - 1),
        });
        const nextCircuit = recordRuntimeCircuitFailure(dashboardCircuitKey);
        if (nextCircuit.state === "open") {
          recordRuntimeMetric(dashboardMetricsScope, { type: "breaker_open" });
        }
      } else {
        recordRuntimeCircuitSuccess(dashboardCircuitKey);
        recordRuntimeMetric(dashboardMetricsScope, {
          type: "success",
          retries:
            Math.max(0, ordersResult.attempts - 1) +
            Math.max(0, requestsResult.attempts - 1),
        });
      }

      const nextOrders = ordersResult.ok
        ? ((ordersResult.data?.orders ?? []) as StaffOrderRowData[])
        : cached?.orders ?? currentOrders;
      const nextRequests = requestsResult.ok
        ? ((requestsResult.data?.requests ?? []) as StaffRequestSummary[])
        : cached?.requests ?? currentRequests;

      const hasOrdersFallback =
        ordersResult.ok || cached?.orders != null || currentOrders.length > 0;
      const hasRequestsFallback =
        requestsResult.ok || cached?.requests != null || currentRequests.length > 0;

      if (!hasOrdersFallback || !hasRequestsFallback) {
        setOrders([]);
        setRequests([]);
        enterTemporaryMode(
          t(
            "Database temporaneamente non disponibile. Nessun dato staff salvato ancora su questo dispositivo.",
            "Database temporarily unavailable. No staff data has been saved on this device yet."
          )
        );
        setLoadError(
          t(
            "Database temporaneamente non disponibile. Nessun dato staff salvato ancora su questo dispositivo.",
            "Database temporarily unavailable. No staff data has been saved on this device yet."
          )
        );
        return;
      }

      setOrders(nextOrders);
      setRequests(nextRequests);
      writeDashboardCache(servedRange, nextOrders, nextRequests);
      if (degraded) {
        enterTemporaryMode(
          t(
            "Database temporaneamente non disponibile. Sto mostrando gli ultimi dati salvati su questo dispositivo.",
            "Database temporarily unavailable. Showing the last data saved on this device."
          )
        );
      } else if (readStaffBufferedActions(restaurantIdentity).length === 0) {
        leaveTemporaryMode();
      }
      setLoadError(
        degraded
          ? t(
              "Database temporaneamente non disponibile. Sto mostrando gli ultimi dati salvati su questo dispositivo.",
              "Database temporarily unavailable. Showing the last data saved on this device."
            )
          : null
      );
      if (!degraded) {
        setActionError(null);
      }
    } catch (error) {
      console.error(error);
      const cached = readDashboardCache(servedRange);
      if (cached) {
        setOrders(cached.orders);
        setRequests(cached.requests);
        enterTemporaryMode(
          t(
            "Database temporaneamente non disponibile. Sto mostrando gli ultimi dati salvati su questo dispositivo.",
            "Database temporarily unavailable. Showing the last data saved on this device."
          )
        );
        setLoadError(
          t(
            "Database temporaneamente non disponibile. Sto mostrando gli ultimi dati salvati su questo dispositivo.",
            "Database temporarily unavailable. Showing the last data saved on this device."
          )
        );
      } else {
        enterTemporaryMode();
        setLoadError(t("Impossibile caricare la dashboard.", "Could not load the dashboard."));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [
    dashboardCircuitKey,
    enterTemporaryMode,
    leaveTemporaryMode,
    preview,
    readDashboardCache,
    dashboardMetricsScope,
    restaurantIdentity,
    router,
    servedRange,
    t,
    writeDashboardCache,
  ]);

  const flushBufferedActions = useCallback(async () => {
    if (preview || bufferFlushBusy) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enterTemporaryMode(
        t(
          "Rete non disponibile. Il buffer resta in attesa.",
          "Network unavailable. The buffer is waiting to sync."
        )
      );
      return;
    }

    const pending = readStaffBufferedActions(restaurantIdentity);
    if (pending.length === 0) {
      setBufferedActions([]);
      leaveTemporaryMode();
      return;
    }

    setBufferFlushBusy(true);

    try {
      let remaining = pending;

      for (const action of pending) {
        let endpoint = "";
        let method = "POST";
        let body: Record<string, unknown> | null = null;

        if (action.kind === "order-status") {
          endpoint = `/api/staff/orders/${action.orderId}`;
          method = "PATCH";
          body = {
            status: action.status,
            actor: action.actor,
          };
        } else if (action.kind === "mark-paid") {
          endpoint = `/api/staff/orders/${action.orderId}/mark-paid`;
          method = "POST";
          body = {
            actor: action.actor,
            actorLabel: action.actorLabel,
            paymentStatus: action.paymentStatus,
          };
        } else if (action.kind === "request-status") {
          endpoint = `/api/staff/requests/${action.requestId}`;
          method = "PATCH";
          body = {
            status: action.status,
          };
        } else {
          endpoint = "/api/staff/orders";
          method = "POST";
          body = {
            ...action.payload,
            clientMutationId: action.clientMutationId,
          };
        }

        try {
          const result = await fetchJsonWithRetry<{ error?: string }>(endpoint, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
          }, {
            attempts: 2,
          });

          if (result.status === 401) {
            router.push("/staff/login");
            return;
          }

          const errorMessage =
            typeof result.data?.error === "string" ? result.data.error : result.errorMessage;

          if (!result.ok) {
            if (isBufferedConflictResolved(action, errorMessage)) {
              remaining = removeStaffBufferedAction(restaurantIdentity, action.id);
              setBufferedActions(remaining);
              continue;
            }

            if (isTemporaryResponseStatus(result.status)) {
              recordRuntimeMetric(outboxMetricsScope, {
                type: "buffer_flush_failure",
                queueLength: remaining.length,
              });
              setBufferedActions(remaining);
              enterTemporaryMode();
              return;
            }

            remaining = removeStaffBufferedAction(restaurantIdentity, action.id);
            setBufferedActions(remaining);
            setActionError(
              errorMessage ??
                t(
                  "Una voce del buffer non e piu valida ed e stata scartata.",
                  "One buffered action is no longer valid and has been discarded."
                )
            );
            continue;
          }

          remaining = removeStaffBufferedAction(restaurantIdentity, action.id);
          setBufferedActions(remaining);
          recordRuntimeMetric(outboxMetricsScope, {
            type: "buffer_flush_success",
            queueLength: remaining.length,
          });
        } catch {
          recordRuntimeMetric(outboxMetricsScope, {
            type: "buffer_flush_failure",
            queueLength: remaining.length,
          });
          setBufferedActions(remaining);
          enterTemporaryMode();
          return;
        }
      }

      if (remaining.length === 0) {
        leaveTemporaryMode();
        setActionError(null);
        await load({ silent: true });
      } else {
        enterTemporaryMode();
      }
    } finally {
      setBufferFlushBusy(false);
    }
  }, [
    bufferFlushBusy,
    enterTemporaryMode,
    isBufferedConflictResolved,
    isTemporaryResponseStatus,
    leaveTemporaryMode,
    load,
    outboxMetricsScope,
    preview,
    restaurantIdentity,
    router,
    t,
  ]);

  const probeStaffRuntime = useCallback(async () => {
    if (preview) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enterTemporaryMode(
        t(
          "Rete non disponibile. Passo in modalita temporanea.",
          "Network unavailable. Switching to temporary mode."
        )
      );
      return;
    }

    try {
      const circuit = getRuntimeCircuitMode(runtimeHealthCircuitKey, {
        threshold: 2,
        cooldownMs: 15000,
      });
      if (!circuit.canRequest) {
        enterTemporaryMode(
          t(
            "Circuit breaker attivo sul controllo rete/database.",
            "Circuit breaker is active on the network/database health check."
          )
        );
        return;
      }

      const result = await fetchJsonWithRetry<{ ok?: boolean; mode?: string }>(
        "/api/staff/network-status",
        {
          cache: "no-store",
        },
        { attempts: 2 }
      );

      if (result.status === 401) {
        router.push("/staff/login");
        return;
      }

      if (!result.ok) {
        const nextCircuit = recordRuntimeCircuitFailure(runtimeHealthCircuitKey, {
          threshold: 2,
          cooldownMs: 15000,
        });
        recordRuntimeMetric(runtimeHealthMetricsScope, {
          type: "failure",
          failureClass: result.failureClass,
          retries: Math.max(0, result.attempts - 1),
        });
        if (nextCircuit.state === "open") {
          recordRuntimeMetric(runtimeHealthMetricsScope, {
            type: "breaker_open",
          });
        }
        enterTemporaryMode();
        return;
      }

      recordRuntimeCircuitSuccess(runtimeHealthCircuitKey);
      recordRuntimeMetric(runtimeHealthMetricsScope, {
        type: "success",
        retries: Math.max(0, result.attempts - 1),
      });

      const pending = syncBufferedActions();
      if (pending.length > 0) {
        await flushBufferedActions();
        return;
      }

      leaveTemporaryMode();
    } catch {
      enterTemporaryMode();
    }
  }, [
    enterTemporaryMode,
    flushBufferedActions,
    leaveTemporaryMode,
    preview,
    router,
    runtimeHealthMetricsScope,
    runtimeHealthCircuitKey,
    syncBufferedActions,
    t,
  ]);

  const reconcileStaffState = useCallback(async () => {
    if (preview || runtimeMode === "temporary") return;

    await load({ silent: true });

    if ((activeRole === "waiter" || activeRole === "manager") && orderTakingLoaded) {
      const result = await fetchJsonWithRetry<{
        tables?: StaffTableRow[];
        categories?: MenuCategory[];
        currency?: string;
        serviceFeePercent?: number;
      }>("/api/staff/order-taking", undefined, { attempts: 2 });

      if (result.ok && result.data) {
        setOrderTakingTables(result.data.tables ?? []);
        setOrderTakingCategories(result.data.categories ?? []);
        setOrderTakingCurrency((result.data.currency ?? "EUR").toUpperCase());
        setOrderTakingServiceFeePercent(Number(result.data.serviceFeePercent ?? 0));
      }
    }

    if (activeRole === "manager" && menuEditorLoaded) {
      const result = await fetchJsonWithRetry<{
        categories?: StaffMenuCategoryRow[];
        items?: StaffMenuItemRow[];
      }>("/api/staff/menu", undefined, { attempts: 2 });

      if (result.ok && result.data) {
        setMenuCategories(result.data.categories ?? []);
        setMenuItems(result.data.items ?? []);
      }
    }

    if (activeRole === "manager" && analyticsLoaded) {
      const result = await fetchJsonWithRetry<StaffAnalyticsPayload>(
        "/api/staff/analytics?days=14",
        undefined,
        { attempts: 2 }
      );

      if (result.ok && result.data) {
        setAnalyticsData(result.data);
      }
    }
  }, [
    activeRole,
    analyticsLoaded,
    load,
    menuEditorLoaded,
    orderTakingLoaded,
    preview,
    runtimeMode,
  ]);

  useEffect(() => {
    if (preview) {
      setOrders(previewOrders);
      setRequests(previewRequests);
      setLoadError(null);
      setLoading(false);
      return;
    }
    if (!initialDashboardLoaded) {
      const cached = readDashboardCache(servedRange);
      if (cached) {
        setOrders(cached.orders);
        setRequests(cached.requests);
        setLoading(false);
      }
    }
    if (initialDashboardLoaded) {
      setLoading(false);
      void load({ silent: true });
    } else {
      void load();
    }
    const timer = setInterval(() => {
      void load({ silent: true });
    }, runtimeMode === "temporary" ? STAFF_RUNTIME_TEMPORARY_POLL_MS : STAFF_RUNTIME_POLL_MS);
    return () => clearInterval(timer);
  }, [
    initialDashboardLoaded,
    load,
    preview,
    previewOrders,
    previewRequests,
    readDashboardCache,
    runtimeMode,
    servedRange,
  ]);

  useEffect(() => {
    if (preview) return;

    const onOnline = () => {
      void probeStaffRuntime();
    };
    const onOffline = () => {
      enterTemporaryMode(
        t(
          "Rete non disponibile. Passo in modalita temporanea.",
          "Network unavailable. Switching to temporary mode."
        )
      );
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void probeStaffRuntime();

    const timer = setInterval(() => {
      void probeStaffRuntime();
    }, STAFF_RUNTIME_HEALTH_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
    };
  }, [enterTemporaryMode, preview, probeStaffRuntime, t]);

  useEffect(() => {
    if (preview || runtimeMode === "temporary") return;

    const timer = setInterval(() => {
      void reconcileStaffState();
    }, 60000);

    return () => clearInterval(timer);
  }, [preview, reconcileStaffState, runtimeMode]);

  useEffect(() => {
    if (preview) return;
    if (runtimeMode === "temporary") return;

    const source = new EventSource("/api/staff/events");
    const onRealtimeUpdate = () => {
      void load({ silent: true });
    };

    source.addEventListener("orders-updated", onRealtimeUpdate);
    source.addEventListener("requests-updated", onRealtimeUpdate);
    source.onerror = () => {
      /* fallback stays on polling */
    };

    return () => {
      source.removeEventListener("orders-updated", onRealtimeUpdate);
      source.removeEventListener("requests-updated", onRealtimeUpdate);
      source.close();
    };
  }, [load, preview, runtimeMode]);

  useEffect(() => {
    if (preview || orderTakingLoaded) return;
    if (activeRole !== "waiter" && activeRole !== "manager") return;

    let cancelled = false;

    async function preloadOrderTaking() {
      try {
        const result = await fetchJsonWithRetry<{
          tables?: StaffTableRow[];
          categories?: MenuCategory[];
          currency?: string;
          serviceFeePercent?: number;
        }>("/api/staff/order-taking", undefined, { attempts: 2 });
        if (!result.ok || cancelled || !result.data) return;

        setOrderTakingTables(result.data.tables ?? []);
        setOrderTakingCategories(result.data.categories ?? []);
        setOrderTakingCurrency((result.data.currency ?? "EUR").toUpperCase());
        setOrderTakingServiceFeePercent(Number(result.data.serviceFeePercent ?? 0));
        setOrderTakingLoaded(true);
      } catch {
        /* keep lazy load fallback inside the panel */
      }
    }

    void preloadOrderTaking();

    return () => {
      cancelled = true;
    };
  }, [activeRole, orderTakingLoaded, preview]);

  useEffect(() => {
    if (preview || activeRole !== "manager") return;
    if (menuEditorLoaded && analyticsLoaded) return;

    let cancelled = false;

    async function preloadManagerPanels() {
      const [menuResult, analyticsResult] = await Promise.allSettled([
        menuEditorLoaded
          ? Promise.resolve(null)
          : fetchJsonWithRetry<{
              categories?: StaffMenuCategoryRow[];
              items?: StaffMenuItemRow[];
            }>("/api/staff/menu", undefined, { attempts: 2 })
              .then((result) => (result.ok ? result.data : null))
              .catch(() => null),
        analyticsLoaded
          ? Promise.resolve(null)
          : fetchJsonWithRetry<StaffAnalyticsPayload>("/api/staff/analytics?days=14", undefined, {
              attempts: 2,
            })
              .then((result) => (result.ok ? result.data : null))
              .catch(() => null),
      ]);

      if (cancelled) return;

      if (
        menuResult.status === "fulfilled" &&
        menuResult.value &&
        !menuEditorLoaded
      ) {
        setMenuCategories(menuResult.value.categories ?? []);
        setMenuItems(menuResult.value.items ?? []);
        setMenuEditorLoaded(true);
      }

      if (
        analyticsResult.status === "fulfilled" &&
        analyticsResult.value &&
        !analyticsLoaded
      ) {
        setAnalyticsData(analyticsResult.value);
        setAnalyticsLoaded(true);
      }
    }

    void preloadManagerPanels();

    return () => {
      cancelled = true;
    };
  }, [activeRole, analyticsLoaded, menuEditorLoaded, preview]);

  async function logout() {
    if (preview) return;
    clearRoleSession();
    await fetch("/api/staff/logout", { method: "POST" });
    router.push("/staff/login");
    router.refresh();
  }

  function handlePinsSaved(nextRolePins: StaffRolePins) {
    setRestaurantSettings((current: unknown | null) =>
      mergeRestaurantStaffAccess({
        settings: current,
        updates: {
          rolePins: nextRolePins,
        },
      })
    );
  }

  async function patchOrderStatus(
    id: string,
    status: OrderTransitionStatus,
    actor: DashboardRole = "manager"
  ) {
    if (preview) {
      const nextRawStatus = status;
      setOrders((current) =>
        current.map((order) =>
          order.id === id
            ? { ...order, status, rawStatus: nextRawStatus }
            : order
        )
      );
      return;
    }
    if (runtimeMode === "temporary" || (typeof navigator !== "undefined" && !navigator.onLine)) {
      applyBufferedOrderStatusLocally(id, status, actor);
      queueBufferedAction({
        id: createStaffBufferedActionId(),
        kind: "order-status",
        createdAt: new Date().toISOString(),
        orderId: id,
        status,
        actor,
      });
      return;
    }
    setActionError(null);
    setUpdatingOrderId(id);
    try {
      const res = await fetch(`/api/staff/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, actor }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (isTemporaryResponseStatus(res.status)) {
          applyBufferedOrderStatusLocally(id, status, actor);
          queueBufferedAction({
            id: createStaffBufferedActionId(),
            kind: "order-status",
            createdAt: new Date().toISOString(),
            orderId: id,
            status,
            actor,
          });
          return;
        }
        setActionError(
          data?.error ?? t("Impossibile aggiornare l'ordine.", "Could not update order.")
        );
        return;
      }

      await load({ silent: true });
    } catch {
      applyBufferedOrderStatusLocally(id, status, actor);
      queueBufferedAction({
        id: createStaffBufferedActionId(),
        kind: "order-status",
        createdAt: new Date().toISOString(),
        orderId: id,
        status,
        actor,
      });
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function markOrderPaid(
    id: string,
    paymentStatus: "paid_cash" | "paid_counter_card" | "paid_at_table",
    actor: Extract<DashboardRole, "manager" | "waiter">
  ) {
    if (preview) {
      setOrders((current) =>
        current.map((order) =>
          order.id === id
            ? {
                ...order,
                rawStatus: "paid",
                status: "new",
                paymentStatus,
                paymentReleased: true,
                paidAt: PREVIEW_TIMESTAMP,
                paymentMarkedByRole: actor,
                paymentMarkedByLabel: deviceLabelDraft.trim() || null,
                stationStatus:
                  order.stationStatus.bar || order.stationStatus.kitchen
                    ? order.stationStatus
                    : {
                        bar: order.items.some((item) => item.station === "bar")
                          ? { status: "new", updatedAt: PREVIEW_TIMESTAMP }
                          : undefined,
                        kitchen: order.items.some((item) => item.station === "kitchen")
                          ? { status: "new", updatedAt: PREVIEW_TIMESTAMP }
                          : undefined,
                      },
              }
            : order
        )
      );
      return;
    }

    if (runtimeMode === "temporary" || (typeof navigator !== "undefined" && !navigator.onLine)) {
      applyBufferedMarkPaidLocally(id, paymentStatus, actor, roleSession?.deviceLabel ?? null);
      queueBufferedAction({
        id: createStaffBufferedActionId(),
        kind: "mark-paid",
        createdAt: new Date().toISOString(),
        orderId: id,
        paymentStatus,
        actor,
        actorLabel: roleSession?.deviceLabel ?? "",
      });
      return;
    }

    setActionError(null);
    setMarkingPaidOrderId(id);
    try {
      const res = await fetch(`/api/staff/orders/${id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor,
          actorLabel: roleSession?.deviceLabel ?? "",
          paymentStatus,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (isTemporaryResponseStatus(res.status)) {
          applyBufferedMarkPaidLocally(
            id,
            paymentStatus,
            actor,
            roleSession?.deviceLabel ?? null
          );
          queueBufferedAction({
            id: createStaffBufferedActionId(),
            kind: "mark-paid",
            createdAt: new Date().toISOString(),
            orderId: id,
            paymentStatus,
            actor,
            actorLabel: roleSession?.deviceLabel ?? "",
          });
          return;
        }
        setActionError(
          data?.error ??
            t("Impossibile confermare il pagamento.", "Could not confirm payment.")
        );
        return;
      }

      await load({ silent: true });
    } catch {
      applyBufferedMarkPaidLocally(id, paymentStatus, actor, roleSession?.deviceLabel ?? null);
      queueBufferedAction({
        id: createStaffBufferedActionId(),
        kind: "mark-paid",
        createdAt: new Date().toISOString(),
        orderId: id,
        paymentStatus,
        actor,
        actorLabel: roleSession?.deviceLabel ?? "",
      });
    } finally {
      setMarkingPaidOrderId(null);
    }
  }

  async function patchRequestStatus(id: string, status: StaffBufferedRequestStatus) {
    if (preview) {
      setRequests((current) =>
        current.map((request) =>
          request.id === id
            ? {
                ...request,
                status,
                updatedAt: new Date().toISOString(),
              }
            : request
        )
      );
      return;
    }
    if (runtimeMode === "temporary" || (typeof navigator !== "undefined" && !navigator.onLine)) {
      applyBufferedRequestStatusLocally(id, status);
      queueBufferedAction({
        id: createStaffBufferedActionId(),
        kind: "request-status",
        createdAt: new Date().toISOString(),
        requestId: id,
        status,
      });
      return;
    }
    setActionError(null);
    setUpdatingRequestId(id);
    try {
      const res = await fetch(`/api/staff/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (isTemporaryResponseStatus(res.status)) {
          applyBufferedRequestStatusLocally(id, status);
          queueBufferedAction({
            id: createStaffBufferedActionId(),
            kind: "request-status",
            createdAt: new Date().toISOString(),
            requestId: id,
            status,
          });
          return;
        }
        setActionError(
          data?.error ?? t("Impossibile aggiornare la richiesta.", "Could not update request.")
        );
        return;
      }

      await load({ silent: true });
    } catch {
      applyBufferedRequestStatusLocally(id, status);
      queueBufferedAction({
        id: createStaffBufferedActionId(),
        kind: "request-status",
        createdAt: new Date().toISOString(),
        requestId: id,
        status,
      });
    } finally {
      setUpdatingRequestId(null);
    }
  }

  const bufferOrderTakingSubmission = useCallback(
    async (payload: {
      tableId: string;
      language: StaffBufferedUiLanguage;
      paymentLocation: StaffBufferedPaymentLocation;
      paymentMethod: StaffBufferedPaymentMethod;
      items: StaffBufferedCreateOrderItem[];
    }) => {
      const nextPayload = createBufferedCreateOrderPayload(payload);

      return queueBufferedAction({
        id: createStaffBufferedActionId(),
        kind: "create-order",
        createdAt: new Date().toISOString(),
        clientMutationId: nextPayload.clientMutationId,
        payload: {
          tableId: nextPayload.tableId,
          language: nextPayload.language,
          paymentLocation: nextPayload.paymentLocation,
          paymentMethod: nextPayload.paymentMethod,
          items: nextPayload.items,
        },
      });
    },
    [createBufferedCreateOrderPayload, queueBufferedAction]
  );

  const loadRewardStatus = useCallback(
    async (code: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;

      if (!silent) {
        setRewardBusy(true);
        setRewardError(null);
        setRewardResult(null);
      }

      try {
        const res = await fetch("/api/staff/rewards/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();

        if (!res.ok && !data.reward) {
          setRewardError(data.error ?? t("Premio non trovato", "Reward not found"));
          return;
        }

        setRewardCode(code);
        setRewardResult(data as RewardVerificationResult);
        setRewardError(
          res.ok
            ? null
            : data.state === "already_redeemed"
              ? t("Gia riscattato", "Already redeemed")
              : data.state === "expired"
                ? t("Scaduto", "Expired")
                : data.error ?? null
        );
      } catch {
        if (!silent) {
          setRewardError(t("Impossibile verificare il premio.", "Could not verify reward."));
        }
      } finally {
        if (!silent) {
          setRewardBusy(false);
        }
      }
    },
    [t]
  );

  const verifyReward = useCallback(async (overrideCode?: string) => {
    const code = (overrideCode ?? rewardCode).trim().toUpperCase();
    if (!code) return;

    if (preview) {
      setRewardBusy(true);
      setRewardError(null);
      setRewardResult(null);
      await new Promise((resolve) => setTimeout(resolve, 150));
      setRewardCode(code);
      setRewardResult({
        state: "valid",
        reward: {
          id: "preview-reward",
          code,
          prizeType: "cocktail",
          title: "Cocktail gratis",
          description: "Preview reward",
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          redeemedAt: null,
          currentStatus: t("Valido", "Valid"),
        },
        order: {
          orderId: "preview-order-1",
          orderNumber: "PREVIEW-01",
          tableNumber: "12",
          restaurantName,
        },
      });
      setRewardBusy(false);
      return;
    }

    await loadRewardStatus(code);
  }, [loadRewardStatus, preview, restaurantName, rewardCode, t]);

  async function redeemReward() {
    const code = rewardCode.trim().toUpperCase();
    if (!code) return;

    if (preview) {
      setRewardResult((current) =>
        current
          ? {
              ...current,
              state: "already_redeemed",
              reward: {
                ...current.reward,
                redeemedAt: new Date().toISOString(),
                currentStatus: t("Gia riscattato", "Already redeemed"),
              },
            }
          : current
      );
      return;
    }

    setRewardError(null);
    setRewardBusy(true);

    try {
      const res = await fetch("/api/staff/rewards/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setRewardError(
          data.error ?? t("Impossibile riscattare il premio.", "Could not redeem reward.")
        );
        return;
      }

      setRewardResult((current) =>
        current
          ? {
              ...current,
              state: "already_redeemed",
              reward: {
                ...current.reward,
                redeemedAt: data.reward?.redeemedAt ?? new Date().toISOString(),
                currentStatus: t("Gia riscattato", "Already redeemed"),
              },
            }
          : current
      );
    } catch {
      setRewardError(t("Impossibile riscattare il premio.", "Could not redeem reward."));
    } finally {
      setRewardBusy(false);
    }
  }

  useEffect(() => {
    if (preview || activeTab !== "rewards" || !rewardResult?.reward.code) return;

    const timer = setInterval(() => {
      void loadRewardStatus(rewardResult.reward.code ?? rewardCode, { silent: true });
    }, 10000);

    return () => clearInterval(timer);
  }, [activeTab, loadRewardStatus, preview, rewardCode, rewardResult]);

  async function scanQrFromFile(file: File) {
    const detectorCtor = (
      window as Window & { BarcodeDetector?: BarcodeDetectorLike }
    ).BarcodeDetector;

    if (!detectorCtor || typeof createImageBitmap !== "function") {
      setRewardError(
        t(
          "Scanner non supportato su questo dispositivo. Inserisci il codice manualmente.",
          "Scanner not supported on this device. Enter the code manually."
        )
      );
      return;
    }

    setRewardBusy(true);
    setRewardError(null);

    try {
      const bitmap = await createImageBitmap(file);
      const detector = new detectorCtor({ formats: ["qr_code"] });
      const results = await detector.detect(bitmap);
      bitmap.close();

      const rawValue = results.find((result) => result.rawValue)?.rawValue?.trim();
      if (!rawValue) {
        setRewardError(t("Nessun QR code trovato.", "No QR code found."));
        return;
      }

      const normalized = rawValue.toUpperCase();
      setRewardCode(normalized);
      await verifyReward(normalized);
    } catch (error) {
      console.error(error);
      setRewardError(t("Impossibile leggere il QR.", "Could not scan QR."));
    } finally {
      setRewardBusy(false);
    }
  }

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesTable =
        tableFilter === "all" ? true : order.tableNumber === tableFilter;
      const matchesSearch =
        q.length === 0
          ? true
          : order.orderNumber.toLowerCase().includes(q) ||
            order.id.toLowerCase().includes(q);

      return matchesTable && matchesSearch;
    });
  }, [orders, search, tableFilter]);

  const ordersByColumn = useMemo(() => {
    return ORDER_COLUMNS.reduce<Record<OrderColumn, OrderRow[]>>(
      (acc, column) => {
        acc[column.id] = filteredOrders.filter(
          (order) => order.paymentReleased && order.status === column.id
        );
        return acc;
      },
      { new: [], preparing: [], ready: [], served: [] }
    );
  }, [filteredOrders]);

  const stationOrdersByRole = useMemo(() => {
    const stationFlows: StationFlow[] = ["new", "preparing", "ready", "served"];

    return {
      bar: stationFlows.reduce<Record<StationFlow, OrderRow[]>>(
        (acc, column) => {
          acc[column] = filteredOrders.filter((order) => {
            if (!order.paymentReleased) return false;
            const status = order.stationStatus.bar?.status;
            return status === column;
          });
          return acc;
        },
        { new: [], preparing: [], ready: [], served: [] }
      ),
      kitchen: stationFlows.reduce<Record<StationFlow, OrderRow[]>>(
        (acc, column) => {
          acc[column] = filteredOrders.filter((order) => {
            if (!order.paymentReleased) return false;
            const status = order.stationStatus.kitchen?.status;
            return status === column;
          });
          return acc;
        },
        { new: [], preparing: [], ready: [], served: [] }
      ),
    };
  }, [filteredOrders]);

  const waiterReadyOrders = useMemo(
    () =>
      filteredOrders.filter(
        (order) => order.paymentReleased && order.readyStations.length > 0
      ),
    [filteredOrders]
  );

  const requestsByGroup = useMemo(() => {
    return REQUEST_GROUPS.reduce<
      Record<StaffRequestKind, Record<RequestColumn, StaffRequestSummary[]>>
    >(
      (acc, group) => {
        acc[group] = REQUEST_COLUMNS.reduce<Record<RequestColumn, StaffRequestSummary[]>>(
          (columnAcc, column) => {
            columnAcc[column.id] = requests.filter(
              (request) => request.kind === group && request.status === column.id
            );
            return columnAcc;
          },
          { new: [], in_progress: [], closed: [] }
        );
        return acc;
      },
      {
        payment_request: { new: [], in_progress: [], closed: [] },
        table_assistance: { new: [], in_progress: [], closed: [] },
      }
    );
  }, [requests]);

  const tableOptions = useMemo(() => {
    return [...new Set(orders.map((order) => order.tableNumber))].sort((a, b) =>
      a.localeCompare(b, "it")
    );
  }, [orders]);

  const activeRoleLabel = activeRole ? getRoleLabel(activeRole) : null;
  const openRequestsByGroup = useMemo(
    () => ({
      payment_request:
        requestsByGroup.payment_request.new.length +
        requestsByGroup.payment_request.in_progress.length,
      table_assistance:
        requestsByGroup.table_assistance.new.length +
        requestsByGroup.table_assistance.in_progress.length,
    }),
    [requestsByGroup]
  );

  useEffect(() => {
    if (initializedRoleRef.current === activeRole) return;
    initializedRoleRef.current = activeRole;

    if (activeRole === "waiter") {
      if (openRequestsByGroup.table_assistance > 0) {
        setWaiterFlow("assistance");
        return;
      }

      if (openRequestsByGroup.payment_request > 0) {
        setWaiterFlow("payments");
        return;
      }

      if (waiterReadyOrders.length > 0) {
        setWaiterFlow("ready");
        return;
      }

      setWaiterFlow("new_order");
      return;
    }

    if (activeRole === "bar" || activeRole === "kitchen") {
      setStationFlow("new");
    }
  }, [
    activeRole,
    openRequestsByGroup.payment_request,
    openRequestsByGroup.table_assistance,
    waiterReadyOrders.length,
  ]);

  const ordersById = useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders]
  );

  function getVisibleItemsForRole(order: OrderRow, role: DashboardRole) {
    if (role === "bar" || role === "kitchen") {
      return order.items.filter((item) => item.station === role);
    }

    if (role === "waiter") {
      return order.items.filter((item) => order.readyStations.includes(item.station));
    }

    return order.items;
  }

  function renderWorkflowBar<T extends string>(args: {
    items: Array<{
      id: T;
      label: string;
      count?: number;
      detail?: string;
      adminKey?: string;
    }>;
    activeId: T;
    onSelect: (id: T) => void;
    ariaLabel: string;
  }) {
    return (
      <div className="rounded-[1.5rem] border border-hairline bg-white/90 p-1.5 shadow-sm backdrop-blur">
        <div className="scrollbar-hide overflow-x-auto">
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${args.items.length}, minmax(0, 1fr))`,
              minWidth: `${Math.max(args.items.length * 7.5, 22)}rem`,
            }}
            aria-label={args.ariaLabel}
          >
            {args.items.map((item) => {
              const active = item.id === args.activeId;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => args.onSelect(item.id)}
                  aria-pressed={active}
                  data-admin-key={item.adminKey}
                  className={
                    active
                      ? "rounded-[1.1rem] px-3 py-2.5 text-left text-white shadow-[0_12px_28px_rgba(0,0,0,0.14)] transition"
                      : "rounded-[1.1rem] px-3 py-2.5 text-left text-ink transition hover:bg-canvas"
                  }
                  style={
                    active
                      ? {
                          background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">{item.label}</span>
                    {typeof item.count === "number" ? (
                      <span
                        className={
                          active
                            ? "rounded-full bg-white/18 px-2 py-0.5 text-[11px] font-medium text-white"
                            : "rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-muted shadow-sm"
                        }
                      >
                        {item.count}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderOrderCard({
    order,
    role,
    actionLabel,
    nextStatus,
  }: {
    order: OrderRow;
    role: DashboardRole;
    actionLabel: string | null;
    nextStatus: OrderTransitionStatus | null;
  }) {
    const isStationRole = role === "bar" || role === "kitchen";
    const visibleItems = getVisibleItemsForRole(order, role);
    const stationServedAt =
      isStationRole &&
      order.stationStatus[role]?.status === "served" &&
      order.stationStatus[role]?.servedAt
        ? order.stationStatus[role]?.servedAt
        : null;
    const scopedTotal =
      role === "manager" || role === "waiter"
        ? order.total
        : visibleItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const displayTime =
      stationServedAt ??
      (order.status === "served" && order.servedAt ? order.servedAt : order.createdAt);

    return (
      <article
        key={order.id}
        className="rounded-lg border border-hairline bg-canvas px-3 py-2.5"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-ink">
            {t("Tavolo", "Table")} {order.tableNumber}
          </p>
          <span className="shrink-0 text-[11px] font-medium tracking-normal text-muted">
            #{order.orderNumber} · {timeFormatter.format(new Date(displayTime))}
          </span>
        </div>
        <ul className="mt-2 space-y-1 text-[13px] text-ink sm:text-sm">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3"
            >
              <span className="min-w-0 truncate">
                {item.quantity}× {item.name}
              </span>
              <span className="shrink-0 tabular-nums text-sm text-ink">
                {formatCents(item.lineTotal, "EUR")}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex items-end justify-between gap-3">
          {!isStationRole && scopedTotal !== order.total ? (
            <p className="text-[11px] text-muted">
              {t("totale", "full")} {formatCents(order.total, "EUR")}
            </p>
          ) : (
            <span />
          )}
          <p className="text-sm font-semibold tabular-nums text-ink">
            {formatCents(scopedTotal, "EUR")}
          </p>
        </div>
        {nextStatus && actionLabel ? (
          <button
            type="button"
            onClick={() => patchOrderStatus(order.id, nextStatus, role)}
            disabled={updatingOrderId === order.id}
            className="mt-2.5 min-h-10 w-full rounded-md bg-bordeaux px-3 py-2.5 text-sm font-medium text-white hover:bg-bordeaux-dark disabled:opacity-40"
          >
            {updatingOrderId === order.id ? t("Aggiornamento…", "Updating…") : actionLabel}
          </button>
        ) : null}
      </article>
    );
  }

  function getPaymentRequestBadge(request: StaffRequestSummary) {
    const order = request.orderId ? ordersById.get(request.orderId) : null;

    if (order?.paymentStatus === "paid_online") {
      return t("App", "App");
    }

    if (order?.paymentStatus === "paid_counter_card") {
      return t("Carta cassa", "Counter card");
    }

    if (order?.paymentStatus === "paid_cash") {
      return request.requestType === "payment_cash"
        ? t("Contanti tavolo", "Table cash")
        : t("Contanti cassa", "Counter cash");
    }

    if (order?.paymentStatus === "paid_at_table") {
      if (order.requestedPaymentMethod === "card") {
        return t("Carta tavolo", "Table card");
      }
      if (order.requestedPaymentMethod === "cash") {
        return t("Contanti tavolo", "Table cash");
      }
      return t("Pagamento tavolo", "Table payment");
    }

    if (request.requestType === "payment_card") {
      return t("Carta tavolo", "Table card");
    }

    if (request.requestType === "payment_cash") {
      return t("Contanti tavolo", "Table cash");
    }

    if (request.requestType === "payment_counter") {
      return t("Cassa", "Counter");
    }

    return t("Pagamento", "Payment");
  }

  function renderRequestCard(args: {
    request: StaffRequestSummary;
    role: Extract<DashboardRole, "manager" | "waiter">;
    accent?: "default" | "payment";
  }) {
    const { request, role, accent = "default" } = args;
    const isPaymentRequest = request.kind === "payment_request";
    const paymentBadge = isPaymentRequest ? getPaymentRequestBadge(request) : null;
    const actionBusy =
      updatingRequestId === request.id ||
      (isPaymentRequest &&
        request.orderId != null &&
        markingPaidOrderId === request.orderId);

    const sharedButtonClass =
      "min-h-10 rounded-md px-3 py-2.5 text-sm font-medium text-white disabled:opacity-40";

    return (
      <article
        key={request.id}
        className="rounded-lg border border-hairline bg-canvas px-3 py-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {t("Tavolo", "Table")} {request.tableNumber}
            </p>
            <p className="mt-1 text-xs text-muted">
              {timeFormatter.format(new Date(request.createdAt))}
            </p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-muted">
            {getRequestColumnTitle(request.status)}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <span
            className={
              accent === "payment"
                ? "rounded-full bg-bordeaux/10 px-2.5 py-1 text-[11px] font-medium text-bordeaux"
                : "rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-muted"
            }
          >
            {isPaymentRequest
              ? paymentBadge
              : getRequestTypeLabel(request.requestType, request.kind)}
          </span>
          {request.orderNumber ? (
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-muted">
              #{request.orderNumber}
            </span>
          ) : null}
        </div>
        {request.note ? (
          <p className="mt-2 text-sm text-muted">{request.note}</p>
        ) : !isPaymentRequest ? (
          <p className="mt-2 text-sm text-muted">{request.detail}</p>
        ) : null}
        {request.status === "new" ? (
          <button
            type="button"
            onClick={() => {
              void patchRequestStatus(request.id, "in_progress");
            }}
            disabled={actionBusy}
            className={`mt-3 w-full bg-bordeaux ${sharedButtonClass}`}
          >
            {actionBusy ? t("Aggiornamento…", "Updating…") : t("Prendi in carico", "Take request")}
          </button>
        ) : null}
        {request.status === "in_progress" && isPaymentRequest ? (
          request.requestType === "payment_counter" ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  if (!request.orderId) return;
                  void markOrderPaid(request.orderId, "paid_cash", role);
                }}
                disabled={actionBusy || !request.orderId}
                className={`w-full bg-bordeaux ${sharedButtonClass}`}
              >
                {actionBusy ? t("Aggiornamento…", "Updating…") : t("Segna contanti", "Mark cash")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!request.orderId) return;
                  void markOrderPaid(request.orderId, "paid_counter_card", role);
                }}
                disabled={actionBusy || !request.orderId}
                className={`w-full bg-bordeaux-dark ${sharedButtonClass}`}
              >
                {actionBusy ? t("Aggiornamento…", "Updating…") : t("Segna carta", "Mark card")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!request.orderId) return;
                void markOrderPaid(request.orderId, "paid_at_table", role);
              }}
              disabled={actionBusy || !request.orderId}
              className={`mt-3 w-full bg-bordeaux ${sharedButtonClass}`}
            >
              {actionBusy
                ? t("Aggiornamento…", "Updating…")
                : request.requestType === "payment_card"
                  ? t("Segna carta tavolo", "Mark table card")
                  : t("Segna contanti tavolo", "Mark table cash")}
            </button>
          )
        ) : null}
        {request.status === "in_progress" && !isPaymentRequest ? (
          <button
            type="button"
            onClick={() => {
              void patchRequestStatus(request.id, "closed");
            }}
            disabled={actionBusy}
            className={`mt-3 w-full bg-bordeaux ${sharedButtonClass}`}
          >
            {actionBusy ? t("Aggiornamento…", "Updating…") : t("Chiudi richiesta", "Close request")}
          </button>
        ) : null}
      </article>
    );
  }

  function renderRequestsSection(args: {
    role: Extract<DashboardRole, "manager" | "waiter">;
    forcedGroup?: StaffRequestKind;
  }) {
    const availableGroups = args.forcedGroup ? [args.forcedGroup] : REQUEST_GROUPS;
    const activeGroup = args.forcedGroup ?? requestGroupFilter;
    const activeGroupRequests = requestsByGroup[activeGroup];
    const filterItems: Array<{
      id: RequestListFilter;
      count: number;
    }> = [
      {
        id: "open",
        count: activeGroupRequests.new.length + activeGroupRequests.in_progress.length,
      },
      {
        id: "new",
        count: activeGroupRequests.new.length,
      },
      {
        id: "in_progress",
        count: activeGroupRequests.in_progress.length,
      },
      {
        id: "closed",
        count: activeGroupRequests.closed.length,
      },
    ];
    const visibleRequests = requests.filter((request) => {
      if (!availableGroups.includes(request.kind)) return false;
      if (request.kind !== activeGroup) return false;

      if (requestListFilter === "open") {
        return request.status !== "closed";
      }

      return request.status === requestListFilter;
    });

    return (
      <section className="mt-5">
        <section className="rounded-xl border border-hairline bg-white p-3 shadow-sm sm:p-4">
          {args.forcedGroup ? null : (
            <div className="flex flex-wrap gap-2 border-b border-hairline pb-3">
              {availableGroups.map((group) => {
                const active = group === activeGroup;

                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setRequestGroupFilter(group)}
                    aria-pressed={active}
                    className={
                      active
                        ? "rounded-full bg-bordeaux px-4 py-2 text-sm font-medium text-white"
                        : "rounded-full bg-canvas px-4 py-2 text-sm font-medium text-ink"
                    }
                  >
                    {getRequestGroupTitle(group)} · {openRequestsByGroup[group]}
                  </button>
                );
              })}
            </div>
          )}

          <div className={`${args.forcedGroup ? "" : "mt-3 "}grid gap-2 sm:grid-cols-2 xl:grid-cols-4`}>
            {filterItems.map((item) => {
              const active = requestListFilter === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRequestListFilter(item.id)}
                  aria-pressed={active}
                  className={
                    active
                      ? "rounded-xl border border-bordeaux bg-bordeaux px-3 py-3 text-left text-white"
                      : "rounded-xl border border-hairline bg-canvas px-3 py-3 text-left text-ink"
                  }
                >
                  <p
                    className={
                      active
                        ? "text-[11px] font-medium uppercase tracking-[0.18em] text-white/72"
                        : "text-[11px] font-medium uppercase tracking-[0.18em] text-muted"
                    }
                  >
                    {getRequestListFilterLabel(item.id)}
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight">
                    {item.count}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-2 xl:grid-cols-2">
            {visibleRequests.length === 0 ? (
              <p className="rounded-lg bg-canvas px-4 py-3 text-sm text-muted xl:col-span-2">
                {t("Nessuna richiesta in questa vista.", "No requests in this view.")}
              </p>
            ) : (
              visibleRequests.map((request) =>
                renderRequestCard({
                  request,
                  role: args.role,
                })
              )
            )}
          </div>
        </section>
      </section>
    );
  }

  function renderManagerPaymentsSection() {
    return (
      <section className="mt-5">
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="flex min-w-max snap-x snap-mandatory gap-3 xl:grid xl:min-w-0 xl:grid-cols-3 xl:items-start">
            {REQUEST_COLUMNS.map((column) => (
              <div
                key={column.id}
                className="min-w-[18rem] snap-start rounded-xl border border-hairline bg-white p-3 shadow-sm sm:min-w-[19.25rem] xl:min-w-0"
              >
                <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2.5">
                  <h3 className="text-sm font-semibold text-ink">
                    {getRequestColumnTitle(column.id)}
                  </h3>
                  <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
                    {requestsByGroup.payment_request[column.id].length}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {requestsByGroup.payment_request[column.id].length === 0 ? (
                    <p className="rounded-md bg-canvas px-3 py-2.5 text-sm text-muted">
                      {t("Nessun pagamento qui.", "No payments here.")}
                    </p>
                  ) : (
                    requestsByGroup.payment_request[column.id].map((request) =>
                      renderRequestCard({
                        request,
                        role: "manager",
                        accent: "payment",
                      })
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  function renderManagerOrdersSection() {
    const activeColumns = ORDER_COLUMNS.filter((column) => column.id !== "served");
    const servedColumn = ORDER_COLUMNS.find((column) => column.id === "served");

    return (
      <section className="mt-5">
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="flex min-w-max snap-x snap-mandatory gap-3 xl:grid xl:min-w-0 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(18rem,21rem)] xl:items-start">
            {activeColumns.map((column) => (
              <div
                key={column.id}
                className="min-w-[18rem] snap-start rounded-xl border border-hairline bg-white p-3 shadow-sm sm:min-w-[19.25rem] xl:min-w-0"
              >
                <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2.5">
                  <h3
                    className="text-sm font-semibold text-ink"
                    data-admin-key={`staff-orders-column-${column.id}`}
                  >
                    {getOrderColumnTitle(column.id)}
                  </h3>
                  <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
                    {ordersByColumn[column.id].length}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {ordersByColumn[column.id].length === 0 ? (
                    <p className="rounded-md bg-canvas px-3 py-2.5 text-sm text-muted">
                      {t("Nessun ordine qui.", "No orders here.")}
                    </p>
                  ) : (
                    ordersByColumn[column.id].map((order) =>
                      renderOrderCard({
                        order,
                        role: "manager",
                        actionLabel: getOrderColumnAction(column.id),
                        nextStatus: column.nextStatus,
                      })
                    )
                  )}
                </div>
              </div>
            ))}
            {servedColumn ? (
              <div className="min-w-[18rem] snap-start rounded-xl border border-hairline bg-white p-3 shadow-sm sm:min-w-[19.25rem] xl:min-w-0">
                <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2.5">
                  <h3
                    className="text-sm font-semibold text-ink"
                    data-admin-key={`staff-orders-column-${servedColumn.id}`}
                  >
                    {getOrderColumnTitle(servedColumn.id)}
                  </h3>
                  <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
                    {ordersByColumn.served.length}
                  </span>
                </div>
                <div className="-mx-1 mt-2 overflow-x-auto px-1 pb-1">
                  <div className="flex min-w-max gap-1">
                    {SERVED_RANGE_OPTIONS.map((range) => {
                      const active = range === servedRange;

                      return (
                        <button
                          key={range}
                          type="button"
                          onClick={() => setServedRange(range)}
                          aria-pressed={active}
                          className={
                            active
                              ? "rounded-full bg-bordeaux px-3 py-1.5 text-xs font-medium text-white"
                              : "rounded-full bg-canvas px-3 py-1.5 text-xs font-medium text-muted"
                          }
                        >
                          {getServedRangeLabel(range)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-2.5 space-y-2 xl:max-h-[calc(100vh-18rem)] xl:overflow-y-auto xl:pr-1">
                  {ordersByColumn.served.length === 0 ? (
                    <p className="rounded-md bg-canvas px-3 py-2.5 text-sm text-muted">
                      {t("Nessun ordine qui.", "No orders here.")}
                    </p>
                  ) : (
                    ordersByColumn.served.map((order) =>
                      renderOrderCard({
                        order,
                        role: "manager",
                        actionLabel: null,
                        nextStatus: servedColumn.nextStatus,
                      })
                    )
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  function renderStationRoleSection(role: Extract<DashboardRole, "bar" | "kitchen">) {
    const ordersByColumn = stationOrdersByRole[role];
    const stationColumns =
      role === "kitchen" ? KITCHEN_STATION_COLUMNS : STATION_COLUMNS;
    const activeColumn =
      stationColumns.find((column) => column.id === stationFlow) ??
      stationColumns[0];

    return (
      <>
        <section className="mt-5">
          {renderWorkflowBar({
            items: stationColumns.map((column) => ({
              id: column.id,
              label: getStationColumnTitle(column.id),
              count: ordersByColumn[column.id].length,
              detail:
                column.id === "served"
                  ? t("solo consultazione", "history only")
                  : getStationColumnAction(column.id) ??
                    t("pronto al passaggio", "ready for handoff"),
            })),
            activeId: stationFlow,
            onSelect: setStationFlow,
            ariaLabel: t("Flusso postazione", "Station flow"),
          })}
        </section>

        <section className="mt-5">
          <div className="rounded-xl border border-hairline bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-center justify-between gap-2 border-b border-hairline pb-2.5">
              <h3 className="text-sm font-semibold text-ink">
                {getStationColumnTitle(activeColumn.id)}
              </h3>
              <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
                {ordersByColumn[activeColumn.id].length}
              </span>
            </div>
            {role === "kitchen" && activeColumn.id === "served" ? (
              <div className="-mx-1 mt-2 overflow-x-auto px-1 pb-1">
                <div className="flex min-w-max gap-1">
                  {SERVED_RANGE_OPTIONS.map((range) => {
                    const active = range === servedRange;

                    return (
                      <button
                        key={range}
                        type="button"
                        onClick={() => setServedRange(range)}
                        aria-pressed={active}
                        className={
                          active
                            ? "rounded-full bg-bordeaux px-3 py-1.5 text-xs font-medium text-white"
                            : "rounded-full bg-canvas px-3 py-1.5 text-xs font-medium text-muted"
                        }
                      >
                        {getServedRangeLabel(range)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="mt-3 space-y-2.5">
              {ordersByColumn[activeColumn.id].length === 0 ? (
                <p className="rounded-md bg-canvas px-3 py-3 text-sm text-muted">
                  {t("Nessun ordine qui.", "No orders here.")}
                </p>
              ) : (
                ordersByColumn[activeColumn.id].map((order) =>
                  renderOrderCard({
                    order,
                    role,
                    actionLabel: getStationColumnAction(activeColumn.id),
                    nextStatus: activeColumn.nextStatus,
                  })
                )
              )}
            </div>
          </div>
        </section>
      </>
    );
  }

  function renderWaiterSection() {
    return (
      <>
        <section className="mt-5">
          {renderWorkflowBar({
            items: [
              {
                id: "assistance",
                label: t("Assistenza", "Assistance"),
                count: openRequestsByGroup.table_assistance,
                detail: t("richieste tavolo", "table requests"),
              },
              {
                id: "payments",
                label: t("Pagamenti", "Payments"),
                count: openRequestsByGroup.payment_request,
                detail: t("tavolo + cassa", "table + cashier"),
              },
              {
                id: "new_order",
                label: t("Nuovo ordine", "New order"),
                detail: t("ingresso rapido", "fast entry"),
              },
              {
                id: "ready",
                label: t("Pronti", "Ready"),
                count: waiterReadyOrders.length,
                detail: t("da servire", "to serve"),
              },
            ],
            activeId: waiterFlow,
            onSelect: setWaiterFlow,
            ariaLabel: t("Flusso cameriere", "Waiter flow"),
          })}
        </section>

        <div className={waiterFlow === "assistance" ? undefined : "hidden"}>
          {renderRequestsSection({
            role: "waiter",
            forcedGroup: "table_assistance",
          })}
        </div>

        <div className={waiterFlow === "payments" ? undefined : "hidden"}>
          {renderRequestsSection({
            role: "waiter",
            forcedGroup: "payment_request",
          })}
        </div>

        {waiterFlow === "new_order" ? (
          <StaffOrderTakingPanel
            restaurantName={restaurantName}
            restaurantSlug={restaurantSlug}
            language={currentLanguage}
            onCreated={async () => {
              await load({ silent: true });
            }}
            onBufferOrder={bufferOrderTakingSubmission}
            temporaryMode={runtimeMode === "temporary"}
            pendingBufferedActions={bufferedActions.length}
            initialTables={orderTakingTables}
            initialCategories={orderTakingCategories}
            initialCurrency={orderTakingCurrency}
            initialServiceFeePercent={orderTakingServiceFeePercent}
            initialDataLoaded={orderTakingLoaded}
          />
        ) : null}

        <div className={waiterFlow === "ready" ? undefined : "hidden"}>
          <section className="mt-5">
            <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              <div className="flex min-w-max snap-x snap-mandatory gap-3">
                {waiterReadyOrders.length === 0 ? (
                  <p className="min-w-[18rem] rounded-xl border border-hairline bg-white px-4 py-4 text-sm text-muted shadow-sm">
                    {t("Nessun ordine pronto da portare.", "No ready orders to serve.")}
                  </p>
                ) : (
                  waiterReadyOrders.map((order) => (
                    <div
                      key={order.id}
                      className="min-w-[19rem] snap-start rounded-xl border border-hairline bg-white p-3 shadow-sm sm:min-w-[20.5rem]"
                    >
                      {renderOrderCard({
                        order,
                        role: "waiter",
                        actionLabel: t("Segna servito", "Mark served"),
                        nextStatus: "served",
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted">
          {t("Caricamento dashboard staff…", "Loading staff dashboard…")}
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh bg-[#f3f1f0] px-4 py-6"
      style={{
        fontFamily: getRestaurantFontFamily(branding.fontPreset),
        background: `linear-gradient(180deg, ${primaryColor}0A 0%, ${secondaryColor}06 24%, #f3f1f0 54%)`,
      }}
      data-admin-font-scope="true"
    >
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <div
                className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-hairline bg-white"
                style={{ borderColor: `${primaryColor}33` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt={restaurantName}
                  className="h-full w-full object-cover"
                  data-admin-field="logo"
                />
              </div>
            ) : null}
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: bodyColor }}>
                {t("Staff dashboard", "Staff dashboard")}
              </p>
              <h1
                className="mt-1 text-2xl font-semibold tracking-tight"
                style={{ color: branding.textColorOverrides.name ?? headingColor }}
                data-admin-field="name"
                data-admin-role="heading"
              >
                {restaurantName}
              </h1>
              {!activeRole ? (
                <p className="mt-1 font-mono text-sm" style={{ color: bodyColor }}>
                  {restaurantSlug}
                </p>
              ) : null}
              {activeRoleLabel ? (
                <p className="mt-1 text-sm" style={{ color: bodyColor }}>
                  {activeRoleLabel}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!preview && activeRole ? (
              <button
                type="button"
                onClick={clearRoleSession}
                className="rounded-md border border-hairline bg-white px-3 py-2 text-sm"
                style={{ color: headingColor }}
              >
                {t("Cambia ruolo", "Change role")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-hairline bg-white px-3 py-2 text-sm"
              style={{ color: headingColor }}
            >
              {t("Esci", "Log out")}
            </button>
          </div>
        </header>

        {activeRole ? (
          <section className="mt-4">
            <div className="flex justify-end">
              <div className="rounded-[1.1rem] border border-hairline bg-white p-1 shadow-sm">
                <div className="flex items-center gap-1">
                  {([
                    { id: "it", label: "IT" },
                    { id: "en", label: "EN" },
                  ] as const).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => updateStaffLanguage(option.id)}
                      className={
                        currentLanguage === option.id
                          ? "rounded-[0.85rem] bg-bordeaux px-4 py-2 text-sm font-medium text-white"
                          : "rounded-[0.85rem] px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeRole === "manager" ? (
          <section className="mt-6">
            {renderWorkflowBar({
              items: [
                {
                  id: "orders",
                  label: getManagerTabLabel("orders"),
                  count: filteredOrders.length,
                  detail: t("servizio", "service"),
                  adminKey: "staff-tab-orders",
                },
                {
                  id: "payments",
                  label: getManagerTabLabel("payments"),
                  count: openRequestsByGroup.payment_request,
                  detail: t("nuove / in corso / chiuse", "new / in progress / closed"),
                  adminKey: "staff-tab-payments",
                },
                {
                  id: "requests",
                  label: getManagerTabLabel("requests"),
                  count: openRequestsByGroup.table_assistance,
                  detail: t("solo richieste staff", "staff requests only"),
                  adminKey: "staff-tab-requests",
                },
                {
                  id: "pins",
                  label: getManagerTabLabel("pins"),
                  count: Object.values(staffAccess.rolePins).reduce(
                    (sum, pins) => sum + pins.length,
                    0
                  ),
                  detail: t("vedi + cambia", "view + change"),
                  adminKey: "staff-tab-pins",
                },
                {
                  id: "availability",
                  label: getManagerTabLabel("availability"),
                  detail: t("stock + forecast", "stock + forecast"),
                  adminKey: "staff-tab-availability",
                },
                {
                  id: "rewards",
                  label: getManagerTabLabel("rewards"),
                  detail: t("scan + riscatto", "scan + redeem"),
                  adminKey: "staff-tab-rewards",
                },
                {
                  id: "analytics",
                  label: getManagerTabLabel("analytics"),
                  detail: t("trend live", "live trends"),
                  adminKey: "staff-tab-analytics",
                },
                {
                  id: "menu",
                  label: getManagerTabLabel("menu"),
                  count: menuItems.length > 0 ? menuItems.length : undefined,
                  detail: t("editor prodotti", "item editor"),
                  adminKey: "staff-tab-menu",
                },
              ],
              activeId: activeTab,
              onSelect: (tab) => setActiveTab(tab),
              ariaLabel: t("Sezioni manager", "Manager sections"),
            })}
          </section>
        ) : null}

        {runtimeNotice || bufferedActions.length > 0 ? (
          <p className="mt-4 rounded-lg border border-bordeaux/15 bg-white px-4 py-3 text-sm text-bordeaux">
            {runtimeNotice ??
              t(
                "Modalita temporanea attiva.",
                "Temporary mode is active."
              )}{" "}
            {bufferedActions.length > 0
              ? t(
                  `${bufferedActions.length} azioni in memoria${bufferFlushBusy ? " · sincronizzazione in corso" : ""}.`,
                  `${bufferedActions.length} actions in buffer${bufferFlushBusy ? " · syncing" : ""}.`
                )
              : null}
          </p>
        ) : null}
        {loadError ? (
          <p className="mt-4 rounded-lg border border-bordeaux/20 bg-white px-4 py-3 text-sm text-bordeaux">
            {loadError}
          </p>
        ) : null}
        {actionError ? (
          <p className="mt-4 rounded-lg border border-bordeaux/20 bg-white px-4 py-3 text-sm text-bordeaux">
            {actionError}
          </p>
        ) : null}

        {!roleSessionReady ? (
          <section className="mt-6 rounded-xl border border-hairline bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">{t("Sessione staff", "Staff session")}</h2>
            <p className="mt-2 text-sm text-muted">
              {t(
                "Sto recuperando il ruolo salvato su questo dispositivo.",
                "Restoring the role saved on this device."
              )}
            </p>
          </section>
        ) : !activeRole ? (
          <section className="mt-6 rounded-xl border border-hairline bg-white p-5 shadow-sm">
            <div className="max-w-3xl">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                Login staff
              </p>
              <div className="mt-2 flex items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">{t("Scegli il ruolo", "Choose role")}</h2>
                <StaffInfoBadge
                  text={t(
                    "il dispositivo puo restare associato al ruolo selezionato fino al logout manuale",
                    "the device can stay associated with the selected role until manual logout"
                  )}
                  label={t("Info ruolo", "Role info")}
                />
              </div>
            </div>

            <div className="mt-5">
              <p className="mb-2 text-sm font-medium text-ink">{t("Lingua", "Language")}</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: "it", label: "Italiano" },
                  { id: "en", label: "English" },
                ] as const).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setLanguageDraft(option.id);
                      setRoleAccessError(null);
                    }}
                    className={
                      languageDraft === option.id
                        ? "rounded-full bg-bordeaux px-4 py-2 text-sm font-medium text-white"
                        : "rounded-full border border-hairline bg-white px-4 py-2 text-sm font-medium text-ink"
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {ROLE_OPTIONS.map((roleOption) => {
                const selected = roleDraft === roleOption.id;

                return (
                  <button
                    key={roleOption.id}
                    type="button"
                    onClick={() => {
                      setRoleDraft(roleOption.id);
                      setRoleAccessError(null);
                    }}
                    className={`rounded-xl border px-4 py-4 text-left transition ${
                      selected
                        ? "border-bordeaux bg-[#f9f0ec] shadow-sm"
                        : "border-hairline bg-canvas hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">
                        {getRoleLabel(roleOption.id)}
                      </p>
                      <StaffInfoBadge
                        text={getRoleDescription(roleOption.id)}
                        label={t("Info ruolo", "Role info")}
                        align="right"
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <input
                type="password"
                inputMode="numeric"
                value={pinDraft}
                onChange={(event) => {
                  setPinDraft(normalizeStaffPin(event.target.value).replace(/\D+/g, ""));
                  setRoleAccessError(null);
                }}
                placeholder={t("PIN del ruolo", "Role PIN")}
                className="rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
              />
              <button
                type="button"
                onClick={() => applyRoleSession(roleDraft, languageDraft, deviceLabelDraft)}
                className="min-h-11 rounded-md bg-bordeaux px-4 py-2.5 text-sm font-medium text-white hover:bg-bordeaux-dark"
              >
                {t("Continua", "Continue")}
              </button>
            </div>
            {roleAccessError ? (
              <p className="mt-3 text-sm text-bordeaux">{roleAccessError}</p>
            ) : null}
          </section>
        ) : activeRole === "manager" ? (
          activeTab === "orders" ? (
            <>
              <section className="mt-5 rounded-lg border border-hairline bg-white p-2 shadow-sm sm:p-2.5">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t("Cerca id ordine", "Search order id")}
                    className="flex-1 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                  />
                  <select
                    value={tableFilter}
                    onChange={(event) => setTableFilter(event.target.value)}
                    className="rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                  >
                    <option value="all">{t("Tutti i tavoli", "All tables")}</option>
                    {tableOptions.map((tableNumber) => (
                      <option key={tableNumber} value={tableNumber}>
                        {t("Tavolo", "Table")} {tableNumber}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              {renderManagerOrdersSection()}
            </>
          ) : activeTab === "payments" ? (
            renderManagerPaymentsSection()
          ) : activeTab === "requests" ? (
            renderRequestsSection({
              role: "manager",
              forcedGroup: "table_assistance",
            })
          ) : activeTab === "pins" ? (
            preview ? (
              <section className="mt-6 rounded-xl border border-hairline bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">PIN</h2>
                <p className="mt-2 text-sm text-muted">
                  {t(
                    "Anteprima clone: qui nella dashboard reale puoi vedere e aggiornare i PIN staff del locale.",
                    "Clone preview: in the live dashboard this section lets you view and update the venue staff PINs."
                  )}
                </p>
              </section>
            ) : (
              <StaffPinPanel
                language={currentLanguage}
                initialRolePins={staffAccess.rolePins}
                onSaved={handlePinsSaved}
              />
            )
          ) : activeTab === "availability" ? (
            preview ? (
              <section className="mt-6 rounded-xl border border-hairline bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">
                  {getManagerTabLabel("availability")}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {t(
                    "Anteprima clone: la struttura della tab e reale, ma il Radar Piatti usa dati operativi salvati sul locale e non viene caricato dal backend.",
                    "Clone preview: the tab layout is real, but Dish Radar uses live restaurant data and is not loaded from the backend here."
                  )}
                </p>
              </section>
            ) : (
              <StaffAvailabilityPanel language={currentLanguage} />
            )
          ) : activeTab === "analytics" ? (
            preview ? (
              <section className="mt-6 rounded-xl border border-hairline bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">
                  {getManagerTabLabel("analytics")}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {t(
                    "Anteprima clone: la navigazione della tab e reale, ma i dati analytics non vengono caricati dal backend.",
                    "Clone preview: tab navigation is real, but analytics data is not loaded from the backend."
                  )}
                </p>
              </section>
            ) : (
              <StaffAnalyticsPanel
                language={currentLanguage}
                initialData={analyticsData}
                initialDataLoaded={analyticsLoaded}
              />
            )
          ) : activeTab === "menu" ? (
            preview ? (
              <section className="mt-6 rounded-xl border border-hairline bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-ink">Menu</h2>
                <p className="mt-2 text-sm text-muted">
                  {t(
                    "Anteprima clone: il design resta modificabile, ma le azioni menu non salvano dati operativi reali.",
                    "Clone preview: the design stays editable, but menu actions do not save real operational data."
                  )}
                </p>
              </section>
            ) : (
              <StaffMenuPanel
                restaurantName={restaurantName}
                language={currentLanguage}
                initialCategories={menuCategories}
                initialItems={menuItems}
                initialDataLoaded={menuEditorLoaded}
              />
            )
          ) : (
            <section className="mt-6 rounded-xl border border-hairline bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row">
                <input
                  type="text"
                  value={rewardCode}
                  onChange={(event) => setRewardCode(event.target.value.toUpperCase())}
                  placeholder={t("Codice premio", "Reward code")}
                  className="flex-1 rounded-md border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                />
                <button
                  type="button"
                  onClick={() => scanInputRef.current?.click()}
                  className="rounded-md border border-hairline bg-white px-4 py-2.5 text-sm font-medium text-ink"
                >
                  {t("Scansiona QR", "Scan QR")}
                </button>
                <button
                  type="button"
                  onClick={() => verifyReward()}
                  disabled={rewardBusy || rewardCode.trim().length === 0}
                    className="rounded-md bg-bordeaux px-4 py-2.5 text-sm font-medium text-white hover:bg-bordeaux-dark disabled:opacity-40"
                  >
                    {rewardBusy ? t("Verifica…", "Checking…") : t("Verifica", "Verify")}
                  </button>
              </div>

              <input
                ref={scanInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    await scanQrFromFile(file);
                  }
                  event.target.value = "";
                }}
              />

              {rewardError ? (
                <p className="mt-4 text-sm text-bordeaux">{rewardError}</p>
              ) : null}

              {rewardResult ? (
                <div className="mt-5 rounded-lg border border-hairline bg-canvas p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                        {t("Premio", "Reward")}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-ink">
                        {localizedRewardCopy?.title ?? rewardResult.reward.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        {localizedRewardCopy?.description ?? rewardResult.reward.description}
                      </p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-bordeaux">
                      {getRewardStatusLabel(rewardResult.state)}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-md bg-white px-3 py-3 text-sm">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">
                        {t("Ordine collegato", "Linked order")}
                      </p>
                      <p className="mt-1 font-medium text-ink">
                        #{rewardResult.order.orderNumber} · {t("Tavolo", "Table")}{" "}
                        {rewardResult.order.tableNumber}
                      </p>
                      <p className="mt-1 text-muted">
                        {rewardResult.order.restaurantName}
                      </p>
                    </div>
                    <div className="rounded-md bg-white px-3 py-3 text-sm">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">
                        {t("Codice premio", "Reward code")}
                      </p>
                      <p className="mt-1 font-medium text-ink">
                        {rewardResult.reward.code}
                      </p>
                      <p className="mt-1 text-muted">
                        {t("Emesso", "Issued")}{" "}
                        {longFormatter.format(new Date(rewardResult.reward.issuedAt))}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-md bg-white px-3 py-3 text-sm">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted">
                      {t("Stato attuale", "Current status")}
                    </p>
                    <p className="mt-1 text-ink">{getRewardStatusLabel(rewardResult.state)}</p>
                    {rewardResult.reward.redeemedAt ? (
                      <p className="mt-1 text-muted">
                        {t("Riscattato", "Redeemed")}{" "}
                        {longFormatter.format(new Date(rewardResult.reward.redeemedAt))}
                      </p>
                    ) : (
                      <p className="mt-1 text-muted">
                        {t("Scade", "Expires")}{" "}
                        {longFormatter.format(new Date(rewardResult.reward.expiresAt))}
                      </p>
                    )}
                  </div>
                  {rewardResult.state === "valid" ? (
                    <button
                      type="button"
                      onClick={redeemReward}
                      disabled={rewardBusy}
                      className="mt-4 w-full rounded-md bg-bordeaux py-2.5 text-sm font-medium text-white hover:bg-bordeaux-dark disabled:opacity-40"
                    >
                      {rewardBusy
                        ? t("Riscatto…", "Redeeming…")
                        : t("Riscatta premio", "Redeem reward")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          )
        ) : activeRole === "waiter" ? (
          renderWaiterSection()
        ) : (
          renderStationRoleSection(activeRole)
        )}
      </div>
    </div>
  );
}
