"use client";

import {
  type ReactNode,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  buildPrettyMenuLink,
  buildQrCodeImageUrl,
} from "@/lib/restaurant-links";
import type { DashboardRole } from "@/lib/order-stations";
import {
  getRestaurantBranding,
  type RestaurantEditableTextField,
  getRestaurantFontFamily,
  getRestaurantInterfaceSettings,
  mergeRestaurantInterfaceSettings,
  RESTAURANT_FONT_OPTIONS,
  RESTAURANT_LANGUAGE_OPTIONS,
  type RestaurantLanguageCode,
  type RestaurantFontPreset,
  mergeRestaurantBranding,
} from "@/lib/restaurant-branding";
import {
  EMPTY_STAFF_ROLE_PINS,
  getRestaurantStaffAccess,
  mergeRestaurantStaffAccess,
  normalizeStaffPin,
  type StaffRolePins,
} from "@/lib/staff-access";
import { recordRuntimeMetric } from "@/lib/runtime-metrics";
import {
  fetchJsonWithRetry,
  getRuntimeCircuitKey,
  getRuntimeCircuitMode,
  recordRuntimeCircuitFailure,
  recordRuntimeCircuitSuccess,
} from "@/lib/runtime-resilience";

type TableData = {
  id: string;
  tableNumber: string;
  qrCodeToken: string;
  active: boolean;
};

type RestaurantData = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  currency: string;
  active: boolean;
  allowPayAtCounter: boolean;
  serviceFeePercent: number;
  theme: unknown;
  settings: unknown;
  openingHours: unknown;
  paymentConfig: unknown;
  rewardConfig: unknown;
  staffConfigured: boolean;
  tables: TableData[];
};

type AdminView = "home" | "create" | "restaurants";

type RestaurantFormDraft = {
  name: string;
  slug: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  currency: string;
  fontPreset: RestaurantFontPreset;
  staffTitle: string;
  staffSubtitle: string;
  headingTextColor: string;
  bodyTextColor: string;
  textColorOverrides: Partial<Record<RestaurantEditableTextField, string>>;
  dynamicTexts: Record<string, string>;
  staffPassword: string;
  rolePins: StaffRolePins;
  allowPayAtCounter: boolean;
  allowOnlinePayment: boolean;
  defaultLanguage: RestaurantLanguageCode;
  enabledLanguages: RestaurantLanguageCode[];
  initialTables: string;
};

type PaymentModeValue = "online" | "counter" | "online_counter";
type EditorMode = "navigate" | "edit";
type EditableFieldId = Extract<
  RestaurantEditableTextField,
  "name" | "staffTitle" | "staffSubtitle"
>;

const CURRENCY_OPTIONS = ["eur", "usd", "gbp", "chf"];
const STAFF_PIN_FIELDS: Array<{ role: DashboardRole; label: string }> = [
  { role: "waiter", label: "PIN Cameriere" },
  { role: "bar", label: "PIN Bar" },
  { role: "kitchen", label: "PIN Kitchen" },
  { role: "manager", label: "PIN Responsabile" },
];

const PALETTE_PRESETS = [
  { label: "Bordeaux", primary: "#6E0F1F", secondary: "#4E0915" },
  { label: "Oliva", primary: "#48543A", secondary: "#2C3523" },
  { label: "Navy", primary: "#23395B", secondary: "#122136" },
  { label: "Terracotta", primary: "#A54A2A", secondary: "#6F2B17" },
  { label: "Champagne", primary: "#B88A44", secondary: "#6C5330" },
  { label: "Forest", primary: "#2F5D50", secondary: "#1B3931" },
  { label: "Cobalt", primary: "#2855A1", secondary: "#18315D" },
  { label: "Rosso seta", primary: "#9C2F45", secondary: "#5A1626" },
  { label: "Carbone", primary: "#3B3F46", secondary: "#181A1E" },
  { label: "Sabbia", primary: "#A78B63", secondary: "#6C5940" },
  { label: "Petrolio", primary: "#1E6172", secondary: "#0D3440" },
  { label: "Prugna", primary: "#6A395C", secondary: "#3B1F32" },
  { label: "Amalfi", primary: "#2A6F7E", secondary: "#183B44" },
  { label: "Merlot", primary: "#7C2034", secondary: "#3F0F1D" },
  { label: "Pistacchio", primary: "#6C8A54", secondary: "#39472C" },
  { label: "Corallo", primary: "#C15F4B", secondary: "#6C2E22" },
];

function getPalettePresetValue(primaryColor: string, secondaryColor: string) {
  const match = PALETTE_PRESETS.find(
    (palette) =>
      palette.primary.toLowerCase() === primaryColor.toLowerCase() &&
      palette.secondary.toLowerCase() === secondaryColor.toLowerCase()
  );
  return match?.label ?? "";
}

function getPaymentModeValue(args: {
  allowOnlinePayment: boolean;
  allowPayAtCounter: boolean;
}): PaymentModeValue {
  if (args.allowOnlinePayment && args.allowPayAtCounter) return "online_counter";
  if (args.allowOnlinePayment) return "online";
  return "counter";
}

function applyPaymentMode(
  current: RestaurantFormDraft,
  mode: PaymentModeValue
): RestaurantFormDraft {
  if (mode === "online") {
    return {
      ...current,
      allowOnlinePayment: true,
      allowPayAtCounter: false,
    };
  }

  if (mode === "counter") {
    return {
      ...current,
      allowOnlinePayment: false,
      allowPayAtCounter: true,
    };
  }

  return {
    ...current,
    allowOnlinePayment: true,
    allowPayAtCounter: true,
  };
}

function isNumericLike(text: string) {
  const value = text.trim();
  if (!value) return false;
  const hasDigit = /\d/.test(value);
  if (!hasDigit) return false;
  const hasLetters = /[a-zA-Z]/.test(value);
  const numericShare =
    value.replace(/[^0-9]/g, "").length / Math.max(1, value.replace(/\s/g, "").length);
  const timeLike = /^#?\d+([:.,\\/]\d+)*(\s?(am|pm))?$/i.test(value);
  const currencyLike =
    /^[€$£]/.test(value) ||
    /\d\s?(€|usd|eur|chf|gbp|£|\$)/i.test(value) ||
    /^[0-9]+(?:[.,][0-9]{2})?\s?(€|usd|eur|chf|gbp|£|\$)$/i.test(value);
  const percentLike = /^\d{1,3}%$/.test(value);
  const countLabel = /(table|tavolo|order|ordine|ordini|items|item|n\.|#)\s*#?\d+/i.test(
    value
  );
  const shortNumeric = value.length <= 8 && numericShare >= 0.5;
  return timeLike || currencyLike || percentLike || countLabel || shortNumeric || (!hasLetters && numericShare >= 0.6);
}

function isPlaceholderText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed === "...") return true;
  return /caricamento|loading|attendere|please wait/i.test(trimmed);
}

function makeCreateDraft(): RestaurantFormDraft {
  return {
    name: "",
    slug: "",
    logoUrl: "",
    primaryColor: "#6E0F1F",
    secondaryColor: "#4E0915",
    currency: "eur",
    fontPreset: "manrope",
    staffTitle: "Dashboard staff",
    staffSubtitle: "Ordini, reward e operativita del locale",
    headingTextColor: "#1C1C1C",
    bodyTextColor: "#5C5A57",
    textColorOverrides: {},
    dynamicTexts: {},
    staffPassword: "",
    rolePins: createRolePinsDraft(EMPTY_STAFF_ROLE_PINS),
    allowPayAtCounter: true,
    allowOnlinePayment: true,
    defaultLanguage: "it",
    enabledLanguages: ["it", "en"],
    initialTables: "0",
  };
}

function buildEditDraft(restaurant: RestaurantData): RestaurantFormDraft {
  const branding = getRestaurantBranding(restaurant.theme, restaurant.settings);
  const interfaceSettings = getRestaurantInterfaceSettings(restaurant.settings);
  const staffAccess = getRestaurantStaffAccess(restaurant.settings);
  return {
    name: restaurant.name,
    slug: restaurant.slug,
    logoUrl: restaurant.logoUrl ?? "",
    primaryColor: restaurant.primaryColor,
    secondaryColor: restaurant.secondaryColor,
    currency: restaurant.currency,
    fontPreset: branding.fontPreset,
    staffTitle: branding.staffTitle,
    staffSubtitle: branding.staffSubtitle,
    headingTextColor: branding.headingTextColor,
    bodyTextColor: branding.bodyTextColor,
    textColorOverrides: branding.textColorOverrides,
    dynamicTexts: branding.dynamicTexts,
    staffPassword: "",
    rolePins: createRolePinsDraft(staffAccess.rolePins),
    allowPayAtCounter: restaurant.allowPayAtCounter,
    allowOnlinePayment: interfaceSettings.allowOnlinePayment,
    defaultLanguage: interfaceSettings.defaultLanguage,
    enabledLanguages: interfaceSettings.enabledLanguages,
    initialTables: "0",
  };
}

function getPrettyLink(
  baseUrl: string,
  restaurantName: string,
  restaurantSlug: string,
  tableNumber: string
) {
  return baseUrl
    ? buildPrettyMenuLink(baseUrl, restaurantSlug, tableNumber, restaurantName)
    : `/${restaurantSlug}/menu?${new URLSearchParams({
        table: tableNumber,
        name: restaurantName,
      }).toString()}`;
}

function sortTableNumbers(a: string, b: string) {
  return a.localeCompare(b, "it", { numeric: true, sensitivity: "base" });
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function downloadRemoteFile(
  filename: string,
  url: string,
  fallbackContent?: string
) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Could not fetch remote file");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    return;
  } catch {
    if (fallbackContent) {
      downloadFile(filename.replace(/\.png$/i, ".txt"), fallbackContent, "text/plain;charset=utf-8");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-sm font-medium text-ink">{children}</span>;
}

function createRolePinsDraft(source?: StaffRolePins): StaffRolePins {
  return {
    waiter: source?.waiter.length ? [...source.waiter] : [""],
    bar: source?.bar.length ? [...source.bar] : [""],
    kitchen: source?.kitchen.length ? [...source.kitchen] : [""],
    manager: source?.manager.length ? [...source.manager] : [""],
  };
}

function StaffRolePinFields({
  value,
  onChange,
}: {
  value: StaffRolePins;
  onChange: (next: StaffRolePins) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {STAFF_PIN_FIELDS.map((field) => (
        <div
          key={field.role}
          className="rounded-[var(--radius-card)] border border-hairline bg-white p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <FieldLabel>{field.label}</FieldLabel>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  [field.role]: [...value[field.role], ""],
                })
              }
              className="rounded-full border border-hairline bg-canvas px-3 py-1.5 text-xs font-medium text-ink"
            >
              Aggiungi PIN
            </button>
          </div>

          <div className="space-y-2">
            {value[field.role].map((pin, index) => (
              <div key={`${field.role}-${index}`} className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={pin}
                  onChange={(event) => {
                    const nextPins = value[field.role].map((entry, entryIndex) =>
                      entryIndex === index
                        ? normalizeStaffPin(event.target.value).replace(/\D+/g, "")
                        : entry
                    );
                    onChange({
                      ...value,
                      [field.role]: nextPins,
                    });
                  }}
                  placeholder="1234"
                  className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                />
                {value[field.role].length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...value,
                        [field.role]: value[field.role].filter(
                          (_, entryIndex) => entryIndex !== index
                        ),
                      })
                    }
                    className="rounded-full border border-bordeaux/20 bg-white px-3 py-1.5 text-xs font-medium text-bordeaux"
                  >
                    Rimuovi
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const ADMIN_PREVIEW_HYDRATED_EVENT = "bb-admin-preview-hydrated";
const ADMIN_RESTAURANTS_CACHE_KEY = "bb_admin_restaurants_cache_v1";

function isPreviewIframeHydrated(doc: Document) {
  return doc.body?.dataset.adminPreviewHydrated === "true";
}

function readCachedAdminRestaurants(): RestaurantData[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(ADMIN_RESTAURANTS_CACHE_KEY) ?? "[]"
    );
    return Array.isArray(parsed) ? (parsed as RestaurantData[]) : [];
  } catch {
    return [];
  }
}

function writeCachedAdminRestaurants(restaurants: RestaurantData[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      ADMIN_RESTAURANTS_CACHE_KEY,
      JSON.stringify(restaurants)
    );
  } catch {
    /* ignore storage errors */
  }
}

export function AdminPanel() {
  const router = useRouter();
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const previewCleanupRef = useRef<(() => void) | null>(null);
  const previewMutationRef = useRef<number | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantData[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [view, setView] = useState<AdminView>("home");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<RestaurantFormDraft>(makeCreateDraft());
  const [editDraft, setEditDraft] = useState<RestaurantFormDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<"client" | "staff" | null>(
    null
  );
  const [editorMode, setEditorMode] = useState<EditorMode>("navigate");
  const [selectedEditorField, setSelectedEditorField] =
    useState<EditableFieldId | null>(null);
  const [previewReloadToken, setPreviewReloadToken] = useState(0);
  const [selectionColor, setSelectionColor] = useState<string>("#1C1C1C");
  const [selectionSize, setSelectionSize] = useState<string>("16");
  const [selectionWeight, setSelectionWeight] = useState<string>("400");
  const [showPasswordEditor, setShowPasswordEditor] = useState(false);
  const adminDataMetricsScope = useMemo(
    () => ({ scope: "admin-data" as const }),
    []
  );
  const adminDataCircuitKey = useMemo(
    () => getRuntimeCircuitKey({ scope: "admin-data" }),
    []
  );

  const applyStyleToSelection = useCallback(
    (style: { color?: string; fontSize?: string; fontWeight?: string; fontFamily?: string }) => {
      const frame = previewFrameRef.current;
      const doc = frame?.contentDocument;
      const win = frame?.contentWindow;
      if (!doc || !win) return;
      const selection = win.getSelection();
      if (!selection) return;

      const applyToElement = (el: HTMLElement) => {
        if (el.dataset.adminLock === "numeric") return;
        if (style.color) el.style.color = style.color;
        if (style.fontSize) el.style.fontSize = `${style.fontSize}px`;
        if (style.fontWeight) el.style.fontWeight = style.fontWeight;
        if (style.fontFamily) el.style.fontFamily = style.fontFamily;
      };

      let applied = false;

      for (let i = 0; i < selection.rangeCount; i += 1) {
        const range = selection.getRangeAt(i);
        if (range.collapsed) continue;
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, {
          acceptNode: (node) => {
            if (!(node instanceof HTMLElement)) return NodeFilter.FILTER_REJECT;
            const hasEditTag = node.matches("[data-admin-field],[data-admin-key]");
            if (!hasEditTag) return NodeFilter.FILTER_SKIP;
            return range.intersectsNode(node)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP;
          },
        });
        let current = walker.nextNode();
        while (current) {
          applyToElement(current as HTMLElement);
          applied = true;
          current = walker.nextNode();
        }
      }

      if (!applied) {
        const activeEl = doc.activeElement as HTMLElement | null;
        const editable = activeEl?.closest<HTMLElement>("[data-admin-field],[data-admin-key]");
        if (editable) {
          applyToElement(editable);
          applied = true;
        }
      }

      // If selection is collapsed but inside an editable, apply to the parent editable.
      if (!applied && selection.rangeCount > 0) {
        const anchorParent =
          (selection.anchorNode instanceof HTMLElement
            ? selection.anchorNode
            : selection.anchorNode?.parentElement) ?? null;
        const editable = anchorParent?.closest<HTMLElement>("[data-admin-field],[data-admin-key]");
        if (editable) {
          applyToElement(editable);
        }
      }
    },
    []
  );

  const load = useCallback(async () => {
    const applyRestaurants = (nextRestaurants: RestaurantData[]) => {
      setRestaurants(nextRestaurants);
      setSelectedRestaurantId((current) => {
        if (
          current &&
          nextRestaurants.some((restaurant: RestaurantData) => restaurant.id === current)
        ) {
          return current;
        }
        return nextRestaurants[0]?.id ?? null;
      });
      setLoading(false);
    };

    const cachedRestaurants = readCachedAdminRestaurants();
    if (cachedRestaurants.length > 0) {
      applyRestaurants(cachedRestaurants);
      setError(null);
      setMessage("Modalita offline: sto mostrando l'ultima copia salvata.");
    }

    try {
      const circuit = getRuntimeCircuitMode(adminDataCircuitKey);
      if (!circuit.canRequest) {
        if (cachedRestaurants.length === 0) {
          setError("Impossibile caricare i locali.");
          setLoading(false);
        }
        return;
      }

      const result = await fetchJsonWithRetry<{ restaurants?: RestaurantData[]; error?: string }>(
        "/api/admin/data",
        { cache: "no-store" },
        { attempts: 3 }
      );
      if (result.status === 401) {
        router.push("/admin/login");
        return;
      }

      if (!result.ok || !result.data?.restaurants) {
        recordRuntimeMetric(adminDataMetricsScope, {
          type: "failure",
          failureClass: result.failureClass,
          retries: Math.max(0, result.attempts - 1),
        });
        const nextCircuit = recordRuntimeCircuitFailure(adminDataCircuitKey);
        if (nextCircuit.state === "open") {
          recordRuntimeMetric(adminDataMetricsScope, { type: "breaker_open" });
        }
        if (cachedRestaurants.length === 0) {
          setError(result.errorMessage ?? result.data?.error ?? "Impossibile caricare i locali.");
          setLoading(false);
        }
        return;
      }

      recordRuntimeCircuitSuccess(adminDataCircuitKey);
      recordRuntimeMetric(adminDataMetricsScope, {
        type: "success",
        retries: Math.max(0, result.attempts - 1),
      });

      const nextRestaurants = result.data.restaurants as RestaurantData[];
      writeCachedAdminRestaurants(nextRestaurants);
      applyRestaurants(nextRestaurants);
      setError(null);
      setMessage(null);
    } catch {
      if (cachedRestaurants.length === 0) {
        setError("Impossibile caricare i locali.");
        setLoading(false);
      }
    }
  }, [adminDataCircuitKey, adminDataMetricsScope, router]);

  useEffect(() => {
    load();
    setBaseUrl(
      process.env.NEXT_PUBLIC_APP_URL ||
        (typeof window !== "undefined" ? window.location.origin : "")
    );
  }, [load]);

  const selectedRestaurant = useMemo(
    () =>
      restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) ?? null,
    [restaurants, selectedRestaurantId]
  );

  const sortedTables = useMemo(() => {
    if (!selectedRestaurant) return [];
    return [...selectedRestaurant.tables].sort((left, right) =>
      sortTableNumbers(left.tableNumber, right.tableNumber)
    );
  }, [selectedRestaurant]);

  const customerPreviewPath = useMemo(() => {
    if (!selectedRestaurant) return null;
    const firstTable = sortedTables[0];
    if (!firstTable) return null;
    return `/${selectedRestaurant.slug}/menu?${new URLSearchParams({
      table: firstTable.tableNumber,
      name: selectedRestaurant.name,
    }).toString()}`;
  }, [selectedRestaurant, sortedTables]);

  const staffPreviewPath = useMemo(() => {
    if (!selectedRestaurant) return null;
    return `/staff?${new URLSearchParams({
      restaurant: selectedRestaurant.slug,
      restaurantName: selectedRestaurant.name,
    }).toString()}`;
  }, [selectedRestaurant]);

  const clientPreviewFrameSrc = useMemo(() => {
    if (!customerPreviewPath) return null;
    return `${customerPreviewPath}${
      customerPreviewPath.includes("?") ? "&" : "?"
    }adminPreview=1&adminNonce=${previewReloadToken}`;
  }, [customerPreviewPath, previewReloadToken]);

  const staffPreviewFrameSrc = useMemo(() => {
    if (!staffPreviewPath) return null;
    return `${staffPreviewPath}${
      staffPreviewPath.includes("?") ? "&" : "?"
    }adminPreview=1&adminNonce=${previewReloadToken}`;
  }, [previewReloadToken, staffPreviewPath]);
  const editorFontFamily = editDraft
    ? getRestaurantFontFamily(editDraft.fontPreset)
    : undefined;
  const activeEditableFields = useMemo<
    Array<{ id: EditableFieldId; label: string }>
  >(() => {
    if (previewTarget === "client") {
      return [{ id: "name", label: "Nome locale" }];
    }

    if (previewTarget === "staff") {
      return [
        { id: "name", label: "Nome locale" },
        { id: "staffTitle", label: "Titolo staff" },
        { id: "staffSubtitle", label: "Sottotitolo staff" },
      ];
    }

    return [];
  }, [previewTarget]);

  useEffect(() => {
    if (!selectedRestaurant) {
      setEditDraft(null);
      setShowPasswordEditor(false);
      return;
    }
    setEditDraft(buildEditDraft(selectedRestaurant));
    setShowPasswordEditor(!selectedRestaurant.staffConfigured);
    setShowAdvanced(false);
    setPreviewTarget(null);
    setEditorMode("navigate");
    setSelectedEditorField(null);
    setPreviewReloadToken((current) => current + 1);
  }, [selectedRestaurant]);

  useEffect(() => {
    return () => {
      previewCleanupRef.current?.();
    };
  }, []);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Link copiato.");
      setError(null);
    } catch {
      setError("Could not copy link.");
    }
  }

  function toggleEditLanguage(language: RestaurantLanguageCode) {
    setEditDraft((current) => {
      if (!current) return current;
      const exists = current.enabledLanguages.includes(language);
      const enabledLanguages = exists
        ? current.enabledLanguages.filter((value) => value !== language)
        : [...current.enabledLanguages, language];
      const safeLanguages =
        enabledLanguages.length > 0 ? enabledLanguages : [current.defaultLanguage];
      return {
        ...current,
        enabledLanguages: safeLanguages,
        defaultLanguage: safeLanguages.includes(current.defaultLanguage)
          ? current.defaultLanguage
          : safeLanguages[0],
      };
    });
  }

  function transferInterfaceStyle(target: "client" | "staff") {
    setMessage(
      target === "client"
        ? "Font, colori e logo sono condivisi: il salvataggio aggiornera anche l'interfaccia cliente."
        : "Font, colori e logo sono condivisi: il salvataggio aggiornera anche l'interfaccia staff."
    );
    setError(null);
    setPreviewTarget(target);
    setEditorMode("edit");
    setSelectedEditorField(null);
    setPreviewReloadToken((current) => current + 1);
  }

  function setEditableFieldValue(field: EditableFieldId, value: string) {
    setEditDraft((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current
    );
  }

  // color helpers removed after toolbar simplification; keep placeholder to avoid lint complaints

  const applyPreviewDraft = useCallback(() => {
    if (!editDraft) return;
    const frame = previewFrameRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    if (!isPreviewIframeHydrated(doc)) return;
    const allowDynamicTextEditing = previewTarget === "staff";

    const styleId = "restaurant-admin-live-style";
    let styleTag = doc.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = doc.createElement("style");
      styleTag.id = styleId;
      doc.head.appendChild(styleTag);
    }

    doc.body.dataset.adminMode = editorMode;

    const editSelector = allowDynamicTextEditing
      ? "body[data-admin-mode=\"edit\"] [data-admin-field], body[data-admin-mode=\"edit\"] [data-admin-key]"
      : "body[data-admin-mode=\"edit\"] [data-admin-field]";

    styleTag.textContent = `
      body[data-admin-mode] {
        font-family: ${editorFontFamily ?? "inherit"} !important;
      }
      body[data-admin-mode] [data-admin-role="heading"] {
        color: ${editDraft.headingTextColor} !important;
      }
      body[data-admin-mode] [data-admin-role="body"] {
        color: ${editDraft.bodyTextColor} !important;
      }
      body[data-admin-mode] [data-admin-role="primary-text"] {
        color: ${editDraft.primaryColor} !important;
      }
      body[data-admin-mode] [data-admin-role="primary-bg"] {
        background-color: ${editDraft.primaryColor} !important;
      }
      ${editSelector} {
        cursor: text !important;
        outline: 1px dashed ${editDraft.primaryColor}66;
        outline-offset: 4px;
      }
      body[data-admin-mode="edit"] [data-admin-selected="true"] {
        outline: 2px solid ${editDraft.primaryColor} !important;
        background: ${editDraft.primaryColor}12;
      }
      body[data-admin-mode="edit"] [data-admin-lock="numeric"] {
        cursor: default !important;
        outline: none !important;
        background: transparent !important;
      }
      body[data-admin-mode="edit"] [data-admin-lock="numeric"] * {
        pointer-events: none;
      }
    `;

    const textValues: Record<EditableFieldId, string> = {
      name: editDraft.name,
      staffTitle: editDraft.staffTitle,
      staffSubtitle: editDraft.staffSubtitle,
    };
    const discoveredDynamic: Record<string, string> = {};

    const isVisible = (element: HTMLElement) => {
      const style = doc.defaultView?.getComputedStyle(element);
      if (!style || style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      if (style.opacity === "0") return false;
      if (element.offsetParent === null && style.position !== "fixed") return false;
      return true;
    };

    const getRenderedText = (element: HTMLElement) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.placeholder ?? "";
      }
      if (element instanceof HTMLSelectElement) {
        const option = element.options[element.selectedIndex];
        return option?.text ?? "";
      }
      return (element.innerText ?? element.textContent ?? "").trim();
    };

    const dynamicPrefix = previewTarget ?? "client";
    const restaurantId = selectedRestaurant?.id;

    // force preview language to follow current draft
    if (restaurantId) {
      try {
        const w = doc.defaultView;
        w?.localStorage.setItem(`bb_lang_${restaurantId}`, editDraft.defaultLanguage);
        w?.localStorage.setItem(
          `bb_langs_${restaurantId}`,
          JSON.stringify(editDraft.enabledLanguages)
        );
      } catch {
        // ignore storage errors in preview
      }
    }

    // reset only generated keys/locks from previous targets
    doc
      .querySelectorAll<HTMLElement>(
        "[data-admin-generated=\"true\"],[data-admin-lock],[data-admin-selected]"
      )
      .forEach((el) => {
        if (el.dataset.adminGenerated === "true") {
          el.removeAttribute("data-admin-key");
          el.removeAttribute("data-admin-generated");
        }
        el.removeAttribute("data-admin-lock");
        el.removeAttribute("data-admin-selected");
      });

    const allNodes = Array.from(
      doc.querySelectorAll<HTMLElement>("body *:not(style):not(script):not(head)")
    );

    const ATOMIC_TAGS = new Set([
      "button",
      "a",
      "span",
      "strong",
      "em",
      "small",
      "label",
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "li",
      "th",
      "td",
      "caption",
      "figcaption",
      "option",
    ]);

    allNodes.forEach((element, index) => {
      if (element === doc.body) return;
      if (!isVisible(element)) return;

      const tag = element.tagName.toLowerCase();
      if (tag === "svg" || tag === "path") return;

      const hasExplicitField = !!element.dataset.adminField;
      const hasKey = !!element.dataset.adminKey;
      const ancestorField = element.parentElement?.closest("[data-admin-field]");
      if (ancestorField) return;

      const text = getRenderedText(element);
      const trimmed = text.trim();
      if (!text || !trimmed) return;
      if (isPlaceholderText(trimmed)) return;
      if (isNumericLike(trimmed)) return; // avoid tagging counters / amounts
      if (!hasExplicitField && trimmed.length > 240) return; // evita key su blocchi lunghi

      const hasDirectText = Array.from(element.childNodes).some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0
      );
      const childTextElements = Array.from(element.children).filter((child) => {
        if (!(child instanceof HTMLElement)) return false;
        return isVisible(child) && getRenderedText(child).trim().length > 0;
      });
      const hasElementChildren = childTextElements.length > 0;
      const childAllInline = childTextElements.every((child) => {
        const display = doc.defaultView?.getComputedStyle(child).display ?? "";
        return display.startsWith("inline") || display === "contents";
      });
      const buttonLike =
        tag === "button" ||
        element.getAttribute("role") === "button" ||
        (element as HTMLButtonElement).type === "submit";
      const isAtomicTag = ATOMIC_TAGS.has(tag);

      // If the element mixes text nodes and child elements, wrap each text node
      // into its own span so editing stays local and doesn't flatten the layout.
      if (
        allowDynamicTextEditing &&
        !hasExplicitField &&
        !hasKey &&
        hasElementChildren &&
        hasDirectText &&
        trimmed.length <= 240 &&
        isAtomicTag
      ) {
        const textNodes = Array.from(element.childNodes).filter(
          (node) =>
            node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0
        );
        textNodes.forEach((node, idx) => {
          const span = doc.createElement("span");
          const key = `${dynamicPrefix}-dyn-${index}-${idx}`;
          span.dataset.adminKey = key;
          span.dataset.adminGenerated = "true";
          span.textContent = node.textContent ?? "";
          if (isNumericLike(span.textContent ?? "")) {
            span.dataset.adminLock = "numeric";
          }
          node.parentNode?.replaceChild(span, node);
          if (!(key in editDraft.dynamicTexts)) {
            discoveredDynamic[key] = span.textContent ?? "";
          }
        });
        return;
      }

      const shouldTagThisElement =
        hasExplicitField ||
        hasKey ||
        (isAtomicTag && (hasDirectText || buttonLike)) ||
        (!hasElementChildren && hasDirectText) ||
        (buttonLike && trimmed.length > 0 && trimmed.length <= 160) ||
        (hasElementChildren && childAllInline && hasDirectText && isAtomicTag);

      if (
        allowDynamicTextEditing &&
        !hasExplicitField &&
        !hasKey &&
        shouldTagThisElement
      ) {
        element.dataset.adminKey = `${dynamicPrefix}-dyn-${index}`;
        element.dataset.adminGenerated = "true";
      }

      const key = element.dataset.adminKey;
      if (
        allowDynamicTextEditing &&
        key &&
        !(key in editDraft.dynamicTexts) &&
        trimmed &&
        trimmed.length <= 240 &&
        (isAtomicTag || buttonLike || (!hasElementChildren && hasDirectText))
      ) {
        discoveredDynamic[key] = trimmed;
      }

      if (key && isNumericLike(text)) {
        element.dataset.adminLock = "numeric";
      }
    });

    // For button-like elements with a key, move the key to an inner span to avoid group selection.
    if (allowDynamicTextEditing) {
      doc
        .querySelectorAll<HTMLElement>(
          "button[data-admin-key], a[data-admin-key], [role='button'][data-admin-key], [type='submit'][data-admin-key]"
        )
        .forEach((btn) => {
          const key = btn.dataset.adminKey;
          if (!key) return;
          const existingInner = btn.querySelector<HTMLElement>(`[data-admin-key="${key}"]`);
          if (existingInner) return;
          const textNodes = Array.from(btn.childNodes).filter(
            (node) =>
              node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0
          );
          if (textNodes.length === 0) return;
          textNodes.forEach((node) => {
            const span = doc.createElement("span");
            span.dataset.adminKey = key;
            span.dataset.adminGenerated = "true";
            span.textContent = node.textContent ?? "";
            node.parentNode?.replaceChild(span, node);
            if (!(key in editDraft.dynamicTexts)) {
              discoveredDynamic[key] = span.textContent ?? "";
            }
          });
          btn.removeAttribute("data-admin-key");
          btn.dataset.adminGenerated = "true";
        });
    }

    if (Object.keys(discoveredDynamic).length > 0) {
      setEditDraft((current) =>
        current
          ? {
              ...current,
              dynamicTexts: { ...current.dynamicTexts, ...discoveredDynamic },
            }
          : current
      );
    }

    Object.entries(textValues).forEach(([field, value]) => {
      doc
        .querySelectorAll<HTMLElement>(`[data-admin-field="${field}"]`)
        .forEach((element) => {
          const isActiveElement = doc.activeElement === element;
          const prefix = element.dataset.adminPrefix ?? "";
          const suffix = element.dataset.adminSuffix ?? "";
          const nextValue = `${prefix}${value}${suffix}`;
          const hasElementChildren = element.childElementCount > 0;
          if (!isActiveElement && !hasElementChildren && element.textContent !== nextValue) {
            element.textContent = nextValue;
          }
          const canEditThisField = activeEditableFields.some(
            (entry) => entry.id === field
          );
          element.contentEditable =
            editorMode === "edit" && canEditThisField ? "true" : "false";
          element.spellcheck = false;
          if (editorMode === "edit" && canEditThisField) {
            element.setAttribute("tabindex", "0");
          } else {
            element.removeAttribute("tabindex");
          }
          const fieldColor =
            editDraft.textColorOverrides[field as EditableFieldId] ??
            (field === "name" ? editDraft.headingTextColor : editDraft.bodyTextColor);
          element.style.color = fieldColor;
          element.dataset.adminSelected =
            selectedEditorField === field ? "true" : "false";
        });
    });

    doc.querySelectorAll<HTMLElement>("[data-admin-field]").forEach((element) => {
      const field = element.dataset.adminField;
      if (!field || !(field in textValues)) {
        element.dataset.adminSelected = "false";
      }
      if (field !== "logo") {
        const canEditThisField = !!field
          && activeEditableFields.some((entry) => entry.id === field);
        element.contentEditable =
          editorMode === "edit" && canEditThisField ? "true" : "false";
      }
    });

    doc.querySelectorAll<HTMLElement>("[data-admin-key]").forEach((element) => {
      const key = element.dataset.adminKey ?? "";
      const hasDraftValue = key in editDraft.dynamicTexts;
      const draftValue = hasDraftValue ? editDraft.dynamicTexts[key] : undefined;
      const value = hasDraftValue ? draftValue ?? "" : element.textContent ?? "";
      const isActiveElement = doc.activeElement === element;
      const hasElementChildren = element.childElementCount > 0;
      if (hasDraftValue && !isActiveElement && !hasElementChildren && element.textContent !== value) {
        element.textContent = value;
      }
      const isNumericLocked =
        element.dataset.adminLock === "numeric" || isNumericLike(value);
      if (isNumericLocked) {
        element.dataset.adminLock = "numeric";
      } else {
        element.removeAttribute("data-admin-lock");
      }
      const contentEditableEnabled =
        allowDynamicTextEditing && editorMode === "edit" && !isNumericLocked;
      element.contentEditable = contentEditableEnabled ? "true" : "false";
      element.spellcheck = false;
      if (contentEditableEnabled) {
        element.setAttribute("tabindex", "0");
      } else {
        element.removeAttribute("tabindex");
      }

      // Propagate dataset to child style wrappers so input events keep mapping to the right key.
      element.querySelectorAll<HTMLElement>("span").forEach((child) => {
        if (!child.dataset.adminKey && child.textContent) {
          child.dataset.adminKey = key;
        }
      });
    });

    doc.querySelectorAll<HTMLImageElement>('[data-admin-field="logo"]').forEach((img) => {
      if (editDraft.logoUrl.trim()) {
        img.src = editDraft.logoUrl.trim();
      }
      img.alt = editDraft.name;
    });
  }, [
    activeEditableFields,
    editDraft,
    editorFontFamily,
    editorMode,
    selectedEditorField,
    previewTarget,
    selectedRestaurant,
  ]);

  const bindPreviewFrame = useCallback(function bindPreviewFrameImpl() {
    previewCleanupRef.current?.();
    const frame = previewFrameRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    const previewWindow = doc.defaultView;
    if (!previewWindow) return;
    const readyWindow: Window = previewWindow;
    const allowDynamicTextEditing = previewTarget === "staff";

    if (!isPreviewIframeHydrated(doc)) {
      const retryId = readyWindow.setTimeout(() => {
        readyWindow.removeEventListener(
          ADMIN_PREVIEW_HYDRATED_EVENT,
          handleHydrated
        );
        bindPreviewFrameImpl();
      }, 60);

      function handleHydrated() {
        readyWindow.clearTimeout(retryId);
        bindPreviewFrameImpl();
      }

      readyWindow.addEventListener(ADMIN_PREVIEW_HYDRATED_EVENT, handleHydrated, {
        once: true,
      });

      previewCleanupRef.current = () => {
        readyWindow.clearTimeout(retryId);
        readyWindow.removeEventListener(
          ADMIN_PREVIEW_HYDRATED_EVENT,
          handleHydrated
        );
      };
      return;
    }

    const onClick = (event: MouseEvent) => {
      if (!previewTarget) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const editable =
        target.closest<HTMLElement>("[data-admin-field]") ??
        target.closest<HTMLElement>("[data-admin-key]");
      if (!editable) return;
      const field = editable.dataset.adminField as EditableFieldId | undefined;
      const key = editable.dataset.adminKey;
      if (!field && key && !allowDynamicTextEditing) return;
      if (editorMode === "edit") {
        if (field && !activeEditableFields.some((entry) => entry.id === field)) {
          return;
        }
        if (field) setSelectedEditorField(field);
        editable.focus();
        event.preventDefault();
        event.stopPropagation();
      } else {
        // navigate mode: allow navigation but keep editor selection clean
        if (field) setSelectedEditorField(null);
      }
    };

    const onInput = (event: Event) => {
      if (editorMode !== "edit") return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const editable =
        target.closest<HTMLElement>("[data-admin-field]") ??
        target.closest<HTMLElement>("[data-admin-key]");
      if (!editable) return;
      const field = editable.dataset.adminField as EditableFieldId | undefined;
      const key = editable.dataset.adminKey;
      if (!field && !key) return;
      if (!field && key && !allowDynamicTextEditing) return;

      if (field && !activeEditableFields.some((entry) => entry.id === field)) {
        return;
      }

      if (field) {
        setSelectedEditorField(field);
      }
      const prefix = editable.dataset.adminPrefix ?? "";
      const suffix = editable.dataset.adminSuffix ?? "";
      const raw = editable.textContent ?? "";
      const withoutPrefix = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
      const withoutSuffix =
        suffix && withoutPrefix.endsWith(suffix)
          ? withoutPrefix.slice(0, withoutPrefix.length - suffix.length)
          : withoutPrefix;

      if (field) {
        setEditableFieldValue(field, withoutSuffix);
      } else if (key) {
        setEditDraft((current) =>
          current
            ? {
                ...current,
                dynamicTexts: {
                  ...current.dynamicTexts,
                  [key]: withoutSuffix,
                },
              }
            : current
        );
      }
    };

    const blockActions = (event: Event) => {
      if (!previewTarget) return;
      if (editorMode !== "edit") return;
      event.preventDefault();
      event.stopPropagation();
      // prevent React synthetic handlers too (capture-phase stop)
      if (
        "stopImmediatePropagation" in event &&
        typeof event.stopImmediatePropagation === "function"
      ) {
        event.stopImmediatePropagation();
      }
      const target = event.target as HTMLElement | null;
      const buttonLike = target?.closest<HTMLElement>(
        "button, a, [role='button'], [type='submit'], form"
      );
      const innerEditable =
        buttonLike?.querySelector<HTMLElement>("[data-admin-key]") ?? null;
      if (
        allowDynamicTextEditing &&
        innerEditable &&
        innerEditable.isContentEditable !== true
      ) {
        innerEditable.contentEditable = "true";
        innerEditable.focus();
      }
    };

    const editOnDblClick = (event: MouseEvent) => {
      if (!previewTarget) return;
      if (editorMode !== "edit") return;
      const rawTarget = event.target;
      const base =
        rawTarget instanceof HTMLElement
          ? rawTarget
          : (rawTarget as Node | null)?.parentElement ?? null;
      if (!base) return;
      const buttonLike = base.closest<HTMLElement>(
        "button, a, [role='button'], [type='submit']"
      );
      const editable =
        base.closest<HTMLElement>("[data-admin-field],[data-admin-key]") ||
        buttonLike?.querySelector<HTMLElement>("[data-admin-key]") ||
        buttonLike;
      const field = editable?.dataset.adminField as EditableFieldId | undefined;
      const key = editable?.dataset.adminKey;
      if (!field && key && !allowDynamicTextEditing) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (editable) {
        editable.dataset.adminEditing = "true";
        editable.contentEditable = "true";
        editable.focus();
      } else {
        base.contentEditable = "true";
        base.focus();
      }
      event.preventDefault();
      event.stopPropagation();
    };

    doc.addEventListener("click", onClick, true);
    doc.addEventListener("input", onInput, true);
    doc.addEventListener("click", blockActions, true);
    const clickable = doc.querySelectorAll<HTMLElement>(
      "button, a, [role='button'], [onclick], [type='submit']"
    );
    clickable.forEach((el) => {
      el.addEventListener("click", blockActions, true);
      el.addEventListener("dblclick", editOnDblClick, true);
      el.addEventListener("mousedown", blockActions, true);
      el.addEventListener("mouseup", blockActions, true);
      el.addEventListener("touchstart", blockActions, true);
      el.addEventListener("touchend", blockActions, true);
    });
    const forms = doc.querySelectorAll<HTMLFormElement>("form");
    forms.forEach((form) => {
      form.addEventListener("submit", blockActions, true);
    });

    const observer = new MutationObserver(() => {
      if (previewMutationRef.current) {
        doc.defaultView?.clearTimeout(previewMutationRef.current);
      }
      previewMutationRef.current = doc.defaultView?.setTimeout(() => {
        applyPreviewDraft();
      }, 30) as number | null;
    });
    observer.observe(doc.body, { childList: true, subtree: true });

    previewCleanupRef.current = () => {
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("input", onInput, true);
      doc.removeEventListener("click", blockActions, true);
      clickable.forEach((el) => {
        el.removeEventListener("click", blockActions, true);
        el.removeEventListener("dblclick", editOnDblClick, true);
        el.removeEventListener("mousedown", blockActions, true);
        el.removeEventListener("mouseup", blockActions, true);
        el.removeEventListener("touchstart", blockActions, true);
        el.removeEventListener("touchend", blockActions, true);
      });
      forms.forEach((form) => form.removeEventListener("submit", blockActions, true));
      observer.disconnect();
      if (previewMutationRef.current) {
        doc.defaultView?.clearTimeout(previewMutationRef.current);
        previewMutationRef.current = null;
      }
    };

    applyPreviewDraft();
  }, [activeEditableFields, applyPreviewDraft, editorMode, previewTarget]);

  useEffect(() => {
    if (!previewTarget) return;
    bindPreviewFrame();
    return () => {
      previewCleanupRef.current?.();
    };
  }, [bindPreviewFrame, previewTarget]);

  useEffect(() => {
    if (!previewTarget) return;
    applyPreviewDraft();
  }, [applyPreviewDraft, previewTarget]);

  async function patchTable(
    id: string,
    patch: { active?: boolean; regenerateToken?: boolean },
    successMessage?: string
  ) {
    setMessage(null);
    setError(null);
    setBusy(`table-${id}`);

    try {
      const res = await fetch(`/api/admin/tables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Could not update table.");
        return;
      }
      setMessage(successMessage ?? `Tavolo ${payload.tableNumber} aggiornato.`);
      await load();
    } catch (patchError) {
      console.error(patchError);
      setError("Could not update table.");
    } finally {
      setBusy(null);
    }
  }

  async function createTables(tableNumbers: string[], successMessage: string) {
    if (!selectedRestaurant) return;

    setMessage(null);
    setError(null);
    setBusy("create-tables");

    try {
      const res = await fetch(`/api/admin/restaurants/${selectedRestaurant.id}/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumbers }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Could not create tables.");
        return;
      }

      setMessage(successMessage.replace("{created}", String(payload.created.length)));
      await load();
    } catch (tableError) {
      console.error(tableError);
      setError("Could not create tables.");
    } finally {
      setBusy(null);
    }
  }

  async function onCreateRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!createDraft.name.trim() || !createDraft.slug.trim()) {
      setError("Inserisci nome locale e slug.");
      return;
    }

    setBusy("create-restaurant");

    try {
      const baseBranding = getRestaurantBranding(null, null);
      const branding = mergeRestaurantBranding({
        theme: null,
        settings: null,
        updates: {
          ...baseBranding,
          fontPreset: createDraft.fontPreset,
          staffTitle: createDraft.staffTitle,
          staffSubtitle: createDraft.staffSubtitle,
          headingTextColor: createDraft.headingTextColor,
          bodyTextColor: createDraft.bodyTextColor,
          textColorOverrides: createDraft.textColorOverrides,
          dynamicTexts: createDraft.dynamicTexts,
        },
      });
      const settings = mergeRestaurantInterfaceSettings({
        settings: branding.settings,
        updates: {
          defaultLanguage: createDraft.defaultLanguage,
          enabledLanguages: createDraft.enabledLanguages,
          allowOnlinePayment: createDraft.allowOnlinePayment,
        },
      });
      const nextSettings = mergeRestaurantStaffAccess({
        settings,
        updates: {
          rolePins: createDraft.rolePins,
        },
      });

      const res = await fetch("/api/admin/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createDraft.name.trim(),
          slug: createDraft.slug.trim(),
          logoUrl: createDraft.logoUrl.trim() || null,
          primaryColor: createDraft.primaryColor,
          secondaryColor: createDraft.secondaryColor,
          currency: createDraft.currency,
          allowPayAtCounter: createDraft.allowPayAtCounter,
          theme: branding.theme,
          settings: nextSettings,
          initialTables: Number(createDraft.initialTables || 0),
          staffPassword: createDraft.staffPassword.trim() || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Could not create restaurant.");
        return;
      }

      setMessage(`Locale creato: ${payload.name}`);
      setCreateDraft(makeCreateDraft());
      await load();
      setPreviewReloadToken((current) => current + 1);
      setSelectedRestaurantId(payload.id);
      setView("restaurants");
    } catch (createError) {
      console.error(createError);
      setError("Could not create restaurant.");
    } finally {
      setBusy(null);
    }
  }

  async function onSaveRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRestaurant || !editDraft) return;

    setMessage(null);
    setError(null);

    if (!editDraft.name.trim() || !editDraft.slug.trim()) {
      setError("Inserisci nome locale e slug.");
      return;
    }

    setBusy("save-restaurant");

    try {
      const baseBranding = getRestaurantBranding(
        selectedRestaurant.theme,
        selectedRestaurant.settings
      );
      const branding = mergeRestaurantBranding({
        theme: selectedRestaurant.theme,
        settings: selectedRestaurant.settings,
        updates: {
          ...baseBranding,
          fontPreset: editDraft.fontPreset,
          staffTitle: editDraft.staffTitle,
          staffSubtitle: editDraft.staffSubtitle,
          headingTextColor: editDraft.headingTextColor,
          bodyTextColor: editDraft.bodyTextColor,
          textColorOverrides: editDraft.textColorOverrides,
          dynamicTexts: editDraft.dynamicTexts,
        },
      });
      const settings = mergeRestaurantInterfaceSettings({
        settings: branding.settings,
        updates: {
          defaultLanguage: editDraft.defaultLanguage,
          enabledLanguages: editDraft.enabledLanguages,
          allowOnlinePayment: editDraft.allowOnlinePayment,
        },
      });
      const nextSettings = mergeRestaurantStaffAccess({
        settings,
        updates: {
          rolePins: editDraft.rolePins,
        },
      });

      const res = await fetch(`/api/admin/restaurants/${selectedRestaurant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name.trim(),
          slug: editDraft.slug.trim(),
          logoUrl: editDraft.logoUrl.trim() || null,
          primaryColor: editDraft.primaryColor,
          secondaryColor: editDraft.secondaryColor,
          currency: editDraft.currency,
          allowPayAtCounter: editDraft.allowPayAtCounter,
          theme: branding.theme,
          settings: nextSettings,
          staffPassword: editDraft.staffPassword.trim() || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Could not update restaurant.");
        return;
      }

      setMessage(`Locale aggiornato: ${payload.name}`);
      await load();
      setPreviewReloadToken((current) => current + 1);
    } catch (saveError) {
      console.error(saveError);
      setError("Could not update restaurant.");
    } finally {
      setBusy(null);
    }
  }

  async function onCreateTableRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRestaurant) return;

    const formData = new FormData(event.currentTarget);
    const from = Number(formData.get("from") ?? 0);
    const to = Number(formData.get("to") ?? 0);

    if (!Number.isInteger(from) || !Number.isInteger(to) || from <= 0 || to < from) {
      setError("Intervallo tavoli non valido.");
      return;
    }

    const tableNumbers = Array.from({ length: to - from + 1 }, (_, index) =>
      String(from + index)
    );
    await createTables(tableNumbers, "Tavoli aggiunti: {created}.");
    (event.currentTarget as HTMLFormElement).reset();
  }

  async function onCreateSingleTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRestaurant) return;

    const formData = new FormData(event.currentTarget);
    const tableNumber = String(formData.get("tableNumber") ?? "").trim();

    if (!tableNumber) {
      setError("Inserisci un numero tavolo.");
      return;
    }

    await createTables([tableNumber], `Tavolo ${tableNumber} aggiunto.`);
    (event.currentTarget as HTMLFormElement).reset();
  }

  async function onDeleteAllTables() {
    if (!selectedRestaurant) return;
    const confirmed = window.confirm(
      `Eliminare tutti i tavoli di ${selectedRestaurant.name}, compresi QR, ordini, reward e richieste collegate?`
    );
    if (!confirmed) return;

    setMessage(null);
    setError(null);
    setBusy("delete-all-tables");

    try {
      const res = await fetch(`/api/admin/restaurants/${selectedRestaurant.id}/tables`, {
        method: "DELETE",
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Could not remove tables.");
        return;
      }
      setMessage(
        `Pulizia completata: ${payload.removed?.tables ?? payload.deleted} tavoli, ${payload.removed?.orders ?? 0} ordini, ${payload.removed?.rewards ?? 0} reward e ${payload.removed?.staffRequests ?? 0} richieste staff rimossi.`
      );
      await load();
    } catch (deleteError) {
      console.error(deleteError);
      setError("Could not remove tables.");
    } finally {
      setBusy(null);
    }
  }

  async function onDeleteRestaurant() {
    if (!selectedRestaurant) return;

    const confirmed = window.confirm(
      `Eliminare completamente ${selectedRestaurant.name}? Verranno rimossi locale, staff, menu, tavoli, QR, ordini, reward e richieste collegate.`
    );
    if (!confirmed) return;

    setMessage(null);
    setError(null);
    setBusy("delete-restaurant");

    try {
      const res = await fetch(`/api/admin/restaurants/${selectedRestaurant.id}`, {
        method: "DELETE",
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Could not delete restaurant.");
        return;
      }

      setMessage(
        `Locale eliminato: ${payload.restaurant?.name}. Rimossi ${payload.removed?.tables ?? 0} tavoli, ${payload.removed?.orders ?? 0} ordini, ${payload.removed?.rewards ?? 0} reward e ${payload.removed?.staffRequests ?? 0} richieste.`
      );
      await load();
      setView("restaurants");
    } catch (deleteError) {
      console.error(deleteError);
      setError("Could not delete restaurant.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadTableQr(tableNumber: string, prettyUrl: string) {
    await downloadRemoteFile(
      `${selectedRestaurant?.slug ?? "restaurant"}-table-${tableNumber}-qr.png`,
      buildQrCodeImageUrl(prettyUrl),
      prettyUrl
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const isLocalBaseUrl =
    baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
  const editFormId = selectedRestaurant
    ? `restaurant-edit-${selectedRestaurant.id}`
    : undefined;
  const activeEditorFrameSrc =
    previewTarget === "client" ? clientPreviewFrameSrc : staffPreviewFrameSrc;

  return (
    <div className="min-h-dvh bg-canvas px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
              Platform admin
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              Gestione locali
            </h1>
            <p className="mt-2 text-sm text-muted">
              Interfaccia base, tavoli e QR di ogni ristorante.
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated px-3 py-2 text-sm"
          >
            Log out
          </button>
        </header>

        {message ? (
          <p className="mb-4 rounded-[var(--radius-card)] border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mb-4 rounded-[var(--radius-card)] border border-bordeaux/20 bg-white px-4 py-3 text-sm text-bordeaux">
            {error}
          </p>
        ) : null}

        {view === "home" ? (
          <section className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setView("create")}
              className="rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated px-6 py-8 text-left shadow-[var(--shadow-soft)] transition hover:border-bordeaux/20"
            >
              <p className="text-sm font-semibold text-ink">Aggiungi nuovo locale</p>
              <p className="mt-2 text-sm text-muted">
                Crea un nuovo ristorante con branding base, staff e tavoli iniziali.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setView("restaurants")}
              className="rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated px-6 py-8 text-left shadow-[var(--shadow-soft)] transition hover:border-bordeaux/20"
            >
              <p className="text-sm font-semibold text-ink">I tuoi locali</p>
              <p className="mt-2 text-sm text-muted">
                Apri un locale e gestisci solo interfaccia base, tavoli e QR.
              </p>
            </button>
          </section>
        ) : null}

        {view === "create" ? (
          <section className="mx-auto max-w-4xl">
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setView("home")}
                className="rounded-full border border-hairline bg-white px-3 py-1.5 text-sm font-medium text-ink"
              >
                Indietro
              </button>
            </div>

            <form
              onSubmit={onCreateRestaurant}
              className="rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-5 shadow-[var(--shadow-soft)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                    Nuovo locale
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">
                    Configura il ristorante
                  </h2>
                </div>
                <button
                  type="submit"
                  disabled={busy === "create-restaurant"}
                  className="rounded-[var(--radius-card)] bg-bordeaux px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  {busy === "create-restaurant" ? "Creazione..." : "Crea locale"}
                </button>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <label className="block">
                  <FieldLabel>Nome locale</FieldLabel>
                  <input
                    value={createDraft.name}
                    onChange={(event) =>
                      setCreateDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                  />
                </label>

                <label className="block">
                  <FieldLabel>Slug locale</FieldLabel>
                  <input
                    value={createDraft.slug}
                    onChange={(event) =>
                      setCreateDraft((current) => ({ ...current, slug: event.target.value }))
                    }
                    placeholder="bistrot-bordeaux"
                    className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                  />
                </label>

                <label className="block">
                  <FieldLabel>Logo</FieldLabel>
                  <input
                    value={createDraft.logoUrl}
                    onChange={(event) =>
                      setCreateDraft((current) => ({ ...current, logoUrl: event.target.value }))
                    }
                    placeholder="https://..."
                    className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                  />
                </label>

                <label className="block">
                  <FieldLabel>Valuta</FieldLabel>
                  <select
                    value={createDraft.currency}
                    onChange={(event) =>
                      setCreateDraft((current) => ({ ...current, currency: event.target.value }))
                    }
                    className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                  >
                    {CURRENCY_OPTIONS.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <FieldLabel>Password</FieldLabel>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={createDraft.staffPassword}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        staffPassword: event.target.value,
                      }))
                    }
                    className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                  />
                </label>

                <div className="block lg:col-span-2">
                  <FieldLabel>PIN ruoli staff</FieldLabel>
                  <StaffRolePinFields
                    value={createDraft.rolePins}
                    onChange={(nextRolePins) =>
                      setCreateDraft((current) => ({
                        ...current,
                        rolePins: nextRolePins,
                      }))
                    }
                  />
                </div>

                <label className="block lg:col-span-2">
                  <FieldLabel>Palette</FieldLabel>
                  <select
                    value={getPalettePresetValue(
                      createDraft.primaryColor,
                      createDraft.secondaryColor
                    )}
                    onChange={(event) => {
                      const palette = PALETTE_PRESETS.find(
                        (preset) => preset.label === event.target.value
                      );
                      if (!palette) return;
                      setCreateDraft((current) => ({
                        ...current,
                        primaryColor: palette.primary,
                        secondaryColor: palette.secondary,
                      }));
                    }}
                    className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5 text-sm text-ink"
                  >
                    <option value="">Palette personalizzata</option>
                    {PALETTE_PRESETS.map((palette) => (
                      <option key={palette.label} value={palette.label}>
                        {palette.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="rounded-[var(--radius-card)] border border-hairline bg-white px-3 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                        Colore primario
                      </span>
                      <div className="mt-2 flex items-center gap-3">
                        <input
                          type="color"
                          value={createDraft.primaryColor}
                          onChange={(event) =>
                            setCreateDraft((current) => ({
                              ...current,
                              primaryColor: event.target.value,
                            }))
                          }
                          className="h-10 w-10 rounded border border-hairline bg-transparent p-0"
                        />
                        <input
                          value={createDraft.primaryColor}
                          onChange={(event) =>
                            setCreateDraft((current) => ({
                              ...current,
                              primaryColor: event.target.value,
                            }))
                          }
                          className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-hairline px-3 py-2 text-sm"
                        />
                      </div>
                    </label>
                    <label className="rounded-[var(--radius-card)] border border-hairline bg-white px-3 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                        Colore secondario
                      </span>
                      <div className="mt-2 flex items-center gap-3">
                        <input
                          type="color"
                          value={createDraft.secondaryColor}
                          onChange={(event) =>
                            setCreateDraft((current) => ({
                              ...current,
                              secondaryColor: event.target.value,
                            }))
                          }
                          className="h-10 w-10 rounded border border-hairline bg-transparent p-0"
                        />
                        <input
                          value={createDraft.secondaryColor}
                          onChange={(event) =>
                            setCreateDraft((current) => ({
                              ...current,
                              secondaryColor: event.target.value,
                            }))
                          }
                          className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-hairline px-3 py-2 text-sm"
                        />
                      </div>
                    </label>
                  </div>
                </label>

                <label className="block">
                  <FieldLabel>Font</FieldLabel>
                  <select
                    value={createDraft.fontPreset}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        fontPreset: event.target.value as RestaurantFontPreset,
                      }))
                    }
                    className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                  >
                    {RESTAURANT_FONT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <FieldLabel>Tavoli iniziali</FieldLabel>
                  <input
                    type="number"
                    min="0"
                    value={createDraft.initialTables}
                    onChange={(event) =>
                      setCreateDraft((current) => ({
                        ...current,
                        initialTables: event.target.value,
                      }))
                    }
                    className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                  />
                </label>

              </div>
            </form>
          </section>
        ) : null}

        {view === "restaurants" ? (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setView("home")}
                className="rounded-full border border-hairline bg-white px-3 py-1.5 text-sm font-medium text-ink"
              >
                Indietro
              </button>
              <button
                type="button"
                onClick={() => setView("create")}
                className="rounded-full bg-bordeaux px-4 py-2 text-sm font-medium text-white"
              >
                Aggiungi nuovo locale
              </button>
            </div>

            {restaurants.length === 0 ? (
              <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-6 text-sm text-muted">
                Nessun locale presente.
              </div>
            ) : (
              <>
                <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="block">
                    <FieldLabel>Locale</FieldLabel>
                    <select
                      value={selectedRestaurantId ?? ""}
                      onChange={(event) => setSelectedRestaurantId(event.target.value)}
                      className="w-full rounded-[var(--radius-card)] border border-hairline bg-white px-3 py-3 text-sm text-ink"
                    >
                      {restaurants.map((restaurant) => (
                        <option key={restaurant.id} value={restaurant.id}>
                          {restaurant.name} · {restaurant.slug}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedRestaurant ? (
                    <div className="rounded-[var(--radius-card)] border border-hairline bg-white px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                        Locale attivo
                      </p>
                      <p className="mt-2 text-sm font-semibold text-ink">
                        {selectedRestaurant.name}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        /{selectedRestaurant.slug} · {sortedTables.length} tavoli
                      </p>
                    </div>
                  ) : null}
                </div>

                {selectedRestaurant && editDraft ? (
                  <>
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <form
                      id={editFormId}
                      key={selectedRestaurant.id}
                      onSubmit={onSaveRestaurant}
                      className="rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-5 shadow-[var(--shadow-soft)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                            Modifica interfaccia
                          </p>
                          <h2 className="mt-1 text-lg font-semibold text-ink">
                            {selectedRestaurant.name}
                          </h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={onDeleteRestaurant}
                            disabled={busy === "delete-restaurant"}
                            className="rounded-[var(--radius-card)] border border-bordeaux/20 bg-white px-4 py-2.5 text-sm font-medium text-bordeaux disabled:opacity-40"
                          >
                            {busy === "delete-restaurant"
                              ? "Eliminazione..."
                              : "Elimina locale"}
                          </button>
                          <button
                            type="submit"
                            disabled={busy === "save-restaurant"}
                            className="rounded-[var(--radius-card)] bg-bordeaux px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                          >
                            {busy === "save-restaurant" ? "Salvataggio..." : "Salva"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4">
                        <label className="block">
                          <FieldLabel>Nome locale</FieldLabel>
                          <input
                            value={editDraft.name}
                            onChange={(event) =>
                              setEditDraft((current) =>
                                current ? { ...current, name: event.target.value } : current
                              )
                            }
                            className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                          />
                        </label>

                        <label className="block">
                          <FieldLabel>Slug locale</FieldLabel>
                          <input
                            value={editDraft.slug}
                            onChange={(event) =>
                              setEditDraft((current) =>
                                current ? { ...current, slug: event.target.value } : current
                              )
                            }
                            placeholder="bistrot-bordeaux"
                            className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                          />
                        </label>

                        <label className="block">
                          <FieldLabel>Logo</FieldLabel>
                          <input
                            value={editDraft.logoUrl}
                            onChange={(event) =>
                              setEditDraft((current) =>
                                current ? { ...current, logoUrl: event.target.value } : current
                              )
                            }
                            placeholder="https://..."
                            className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                          />
                        </label>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block">
                            <FieldLabel>Valuta</FieldLabel>
                            <select
                              value={editDraft.currency}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current ? { ...current, currency: event.target.value } : current
                                )
                              }
                              className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                            >
                              {CURRENCY_OPTIONS.map((currency) => (
                                <option key={currency} value={currency}>
                                  {currency.toUpperCase()}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <FieldLabel>Lingua predefinita</FieldLabel>
                            <select
                              value={editDraft.defaultLanguage}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        defaultLanguage:
                                          event.target.value as RestaurantLanguageCode,
                                      }
                                    : current
                                )
                              }
                              className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                            >
                              {editDraft.enabledLanguages.map((language) => {
                                const option = RESTAURANT_LANGUAGE_OPTIONS.find(
                                  (entry) => entry.value === language
                                );
                                return (
                                  <option key={language} value={language}>
                                    {option?.label ?? language.toUpperCase()}
                                  </option>
                                );
                              })}
                            </select>
                          </label>

                          <div className="block sm:col-span-2">
                            <FieldLabel>Lingue attive</FieldLabel>
                            <div className="flex flex-wrap gap-2">
                              {RESTAURANT_LANGUAGE_OPTIONS.map((option) => {
                                const active = editDraft.enabledLanguages.includes(option.value);
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => toggleEditLanguage(option.value)}
                                    className={
                                      active
                                        ? "rounded-full border border-bordeaux bg-bordeaux/5 px-3 py-1.5 text-xs font-medium text-ink"
                                        : "rounded-full border border-hairline bg-canvas px-3 py-1.5 text-xs font-medium text-ink"
                                    }
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <label className="block">
                            <FieldLabel>Pagamenti</FieldLabel>
                            <select
                              value={getPaymentModeValue({
                                allowOnlinePayment: editDraft.allowOnlinePayment,
                                allowPayAtCounter: editDraft.allowPayAtCounter,
                              })}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? applyPaymentMode(
                                        current,
                                        event.target.value as PaymentModeValue
                                      )
                                    : current
                                )
                              }
                              className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                            >
                              <option value="online">online</option>
                              <option value="counter">banco</option>
                              <option value="online_counter">online + banco</option>
                            </select>
                          </label>

                          <div className="block sm:col-span-2">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <FieldLabel>Password</FieldLabel>
                              {selectedRestaurant.staffConfigured ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowPasswordEditor((current) => !current);
                                    setEditDraft((current) =>
                                      current ? { ...current, staffPassword: "" } : current
                                    );
                                  }}
                                  className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
                                >
                                  Modifica password
                                </button>
                              ) : null}
                            </div>

                            {selectedRestaurant.staffConfigured && !showPasswordEditor ? (
                              <div className="rounded-[var(--radius-card)] border border-hairline bg-white px-3 py-2.5 text-sm text-muted">
                                Password configurata
                              </div>
                            ) : (
                              <input
                                type="password"
                                autoComplete="new-password"
                                value={editDraft.staffPassword}
                                onChange={(event) =>
                                  setEditDraft((current) =>
                                    current
                                      ? { ...current, staffPassword: event.target.value }
                                      : current
                                  )
                                }
                                placeholder={
                                  selectedRestaurant.staffConfigured
                                    ? "Nuova password"
                                    : "Imposta password"
                                }
                                className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5"
                              />
                            )}
                          </div>

                          <div className="block sm:col-span-2">
                            <FieldLabel>PIN ruoli staff</FieldLabel>
                            <StaffRolePinFields
                              value={editDraft.rolePins}
                              onChange={(nextRolePins) =>
                                setEditDraft((current) =>
                                  current
                                    ? { ...current, rolePins: nextRolePins }
                                    : current
                                )
                              }
                            />
                          </div>
                        </div>

                        <div className="rounded-[var(--radius-card)] border border-hairline bg-white p-4">
                          <button
                            type="button"
                            onClick={() => setShowAdvanced((current) => !current)}
                            className="flex w-full items-center justify-between gap-3 text-left"
                          >
                            <div>
                              <p className="text-sm font-semibold text-ink">Avanzate</p>
                              <p className="mt-1 text-xs text-muted">
                                Apri l&apos;editor visuale a schermo intero collegato all&apos;interfaccia reale.
                              </p>
                            </div>
                            <span className="rounded-full border border-hairline px-3 py-1 text-xs font-medium text-ink">
                              {showAdvanced ? "Nascondi" : "Apri"}
                            </span>
                          </button>

                          {showAdvanced ? (
                            <div className="mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setPreviewTarget("client");
                                  setEditorMode("navigate");
                                  setSelectedEditorField(null);
                                }}
                                disabled={!clientPreviewFrameSrc}
                                className="rounded-[var(--radius-card)] border border-hairline bg-canvas px-4 py-4 text-left shadow-[var(--shadow-soft)]"
                              >
                                <span className="block text-sm font-semibold text-ink">
                                  Interfaccia cliente
                                </span>
                                <span className="mt-1 block text-xs leading-relaxed text-muted">
                                  {clientPreviewFrameSrc
                                    ? "Apri il menu reale del locale in editor full screen."
                                    : "Crea almeno un tavolo per aprire il menu reale."}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPreviewTarget("staff");
                                  setEditorMode("navigate");
                                  setSelectedEditorField(null);
                                }}
                                className="rounded-[var(--radius-card)] border border-hairline bg-canvas px-4 py-4 text-left shadow-[var(--shadow-soft)]"
                              >
                                <span className="block text-sm font-semibold text-ink">
                                  Interfaccia staff
                                </span>
                                <span className="mt-1 block text-xs leading-relaxed text-muted">
                                  Apri la dashboard staff reale in editor full screen.
                                </span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </form>

                    <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-5 shadow-[var(--shadow-soft)]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                            Tavoli e QR
                          </p>
                          <h2 className="mt-1 text-lg font-semibold text-ink">
                            {sortedTables.length} tavoli
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={onDeleteAllTables}
                          disabled={busy === "delete-all-tables"}
                          className="rounded-[var(--radius-card)] border border-bordeaux/20 bg-white px-3 py-2 text-sm font-medium text-bordeaux disabled:opacity-40"
                        >
                          {busy === "delete-all-tables"
                            ? "Eliminazione..."
                            : "Elimina tutti i tavoli"}
                        </button>
                      </div>

                      <div className="mt-4 rounded-[var(--radius-card)] border border-hairline bg-white p-3">
                        <p className="text-sm font-medium text-ink">Base URL QR</p>
                        <p className="mt-1 break-all text-xs text-muted">
                          {baseUrl || "Not set"}
                        </p>
                        {isLocalBaseUrl ? (
                          <p className="mt-2 text-xs text-bordeaux">
                            I QR puntano ancora a localhost. Usa un dominio pubblico prima di
                            stampare.
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <form
                          onSubmit={onCreateTableRange}
                          className="rounded-[var(--radius-card)] border border-hairline bg-white p-3"
                        >
                          <p className="text-sm font-medium text-ink">Aggiungi tavoli da X a Y</p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <input
                              name="from"
                              type="number"
                              min="1"
                              placeholder="Da"
                              className="rounded-[var(--radius-card)] border border-hairline px-3 py-2.5 text-sm"
                            />
                            <input
                              name="to"
                              type="number"
                              min="1"
                              placeholder="A"
                              className="rounded-[var(--radius-card)] border border-hairline px-3 py-2.5 text-sm"
                            />
                            <button
                              type="submit"
                              disabled={busy === "create-tables"}
                              className="rounded-[var(--radius-card)] border border-hairline bg-canvas px-3 py-2.5 text-sm font-medium text-ink disabled:opacity-40"
                            >
                              Aggiungi
                            </button>
                          </div>
                        </form>

                        <form
                          onSubmit={onCreateSingleTable}
                          className="rounded-[var(--radius-card)] border border-hairline bg-white p-3"
                        >
                          <p className="text-sm font-medium text-ink">Aggiungi tavolo singolo</p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <input
                              name="tableNumber"
                              placeholder="Es. 17"
                              className="rounded-[var(--radius-card)] border border-hairline px-3 py-2.5 text-sm"
                            />
                            <button
                              type="submit"
                              disabled={busy === "create-tables"}
                              className="rounded-[var(--radius-card)] border border-hairline bg-canvas px-3 py-2.5 text-sm font-medium text-ink disabled:opacity-40"
                            >
                              Aggiungi
                            </button>
                          </div>
                        </form>
                      </div>

                      <div className="mt-4 space-y-2">
                        {sortedTables.length === 0 ? (
                          <div className="rounded-[var(--radius-card)] border border-dashed border-hairline bg-white p-4 text-sm text-muted">
                            Nessun tavolo creato.
                          </div>
                        ) : (
                          sortedTables.map((table) => {
                            const prettyUrl = getPrettyLink(
                              baseUrl,
                              selectedRestaurant.name,
                              selectedRestaurant.slug,
                              table.tableNumber
                            );

                            return (
                              <div
                                key={table.id}
                                className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-hairline bg-white p-3 lg:flex-row lg:items-center lg:justify-between"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-ink">
                                      Tavolo {table.tableNumber}
                                    </span>
                                    <span
                                      className={
                                        table.active
                                          ? "rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700"
                                          : "rounded-full bg-canvas px-2 py-1 text-[11px] font-medium text-muted"
                                      }
                                    >
                                      {table.active ? "Attivo" : "Non attivo"}
                                    </span>
                                  </div>
                                  <p className="mt-1 truncate text-xs text-muted">{prettyUrl}</p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => copyText(prettyUrl)}
                                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink"
                                  >
                                    Copia link
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => downloadTableQr(table.tableNumber, prettyUrl)}
                                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink"
                                  >
                                    Scarica QR
                                  </button>
                                  <a
                                    href={buildQrCodeImageUrl(prettyUrl, 640)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink"
                                  >
                                    Apri QR
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      patchTable(
                                        table.id,
                                        { regenerateToken: true },
                                        `Token rigenerato per il tavolo ${table.tableNumber}.`
                                      )
                                    }
                                    disabled={busy === `table-${table.id}`}
                                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-40"
                                  >
                                    Nuovo token
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      patchTable(
                                        table.id,
                                        { active: !table.active },
                                        table.active
                                          ? `Tavolo ${table.tableNumber} disattivato.`
                                          : `Tavolo ${table.tableNumber} riattivato.`
                                      )
                                    }
                                    disabled={busy === `table-${table.id}`}
                                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-40"
                                  >
                                    {table.active ? "Disattiva" : "Attiva"}
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </section>
                  </div>

                    {previewTarget ? (
                      <div className="fixed inset-0 z-50 bg-[#170E11]/70 backdrop-blur-sm">
                        <div className="flex h-full flex-col bg-canvas-elevated">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-white px-4 py-3">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                                {previewTarget === "client"
                                  ? "Interfaccia cliente"
                                  : "Interfaccia staff"}
                              </p>
                              <p className="mt-1 text-sm text-muted">
                                Stessa UI reale, stesso stato aperto. In modifica attivi solo l&apos;editing.
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-1 rounded-full border border-hairline bg-canvas p-1">
                                <button
                                  type="button"
                                  onClick={() => setEditorMode("navigate")}
                                  className={
                                    editorMode === "navigate"
                                      ? "rounded-full bg-bordeaux px-3 py-1.5 text-xs font-medium text-white"
                                      : "rounded-full px-3 py-1.5 text-xs font-medium text-ink"
                                  }
                                >
                                  Naviga
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditorMode("edit")}
                                  className={
                                    editorMode === "edit"
                                      ? "rounded-full bg-bordeaux px-3 py-1.5 text-xs font-medium text-white"
                                      : "rounded-full px-3 py-1.5 text-xs font-medium text-ink"
                                  }
                                >
                                  Modifica
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  transferInterfaceStyle(
                                    previewTarget === "client" ? "staff" : "client"
                                  )
                                }
                                className="rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink"
                              >
                                {previewTarget === "client"
                                  ? "Trasferisci stile all'interfaccia staff"
                                  : "Trasferisci stile all'interfaccia cliente"}
                              </button>

                              <button
                                type="submit"
                                form={editFormId}
                                disabled={busy === "save-restaurant"}
                                className="rounded-full bg-bordeaux px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
                              >
                                {busy === "save-restaurant" ? "Salvataggio..." : "Salva"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setPreviewTarget(null);
                                  setEditorMode("navigate");
                                  setSelectedEditorField(null);
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-white text-sm font-medium text-ink"
                                aria-label="Chiudi editor"
                              >
                                X
                              </button>
                            </div>
                          </div>

                          {editorMode === "edit" ? (
                            <div className="border-b border-hairline bg-white px-4 py-3">
                              <div className="flex flex-wrap items-end gap-3">
                                <label className="min-w-[160px]">
                                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                                    Font
                                  </span>
                                  <select
                                    value={editDraft.fontPreset}
                                    onChange={(event) => {
                                      const nextPreset = event.target.value as RestaurantFontPreset;
                                      const family = getRestaurantFontFamily(nextPreset) ?? undefined;
                                      setEditDraft((current) =>
                                        current ? { ...current, fontPreset: nextPreset } : current
                                      );
                                      applyStyleToSelection({
                                        fontFamily: family,
                                      });
                                    }}
                                    className="w-full rounded-[var(--radius-card)] border border-hairline bg-white px-3 py-2 text-sm"
                                  >
                                    {RESTAURANT_FONT_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="flex items-center gap-2">
                                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                                    Colore
                                  </span>
                                  <input
                                    type="color"
                                    value={selectionColor}
                                    onChange={(event) => {
                                      const next = event.target.value;
                                      setSelectionColor(next);
                                      applyStyleToSelection({ color: next });
                                    }}
                                    className="h-10 w-16 rounded border border-hairline bg-white p-1"
                                  />
                                </label>

                                <label className="min-w-[120px]">
                                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                                    Grandezza
                                  </span>
                                  <select
                                    value={selectionSize}
                                    onChange={(event) => {
                                      const next = event.target.value;
                                      setSelectionSize(next);
                                      applyStyleToSelection({ fontSize: next });
                                    }}
                                    className="w-full rounded-[var(--radius-card)] border border-hairline bg-white px-3 py-2 text-sm"
                                  >
                                    {["12", "14", "16", "18", "20", "22", "24", "28"].map(
                                      (size) => (
                                        <option key={size} value={size}>
                                          {size}px
                                        </option>
                                      )
                                    )}
                                  </select>
                                </label>

                                <label className="min-w-[140px]">
                                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                                    Tipo
                                  </span>
                                  <select
                                    value={selectionWeight}
                                    onChange={(event) => {
                                      const next = event.target.value;
                                      setSelectionWeight(next);
                                      applyStyleToSelection({ fontWeight: next });
                                    }}
                                    className="w-full rounded-[var(--radius-card)] border border-hairline bg-white px-3 py-2 text-sm"
                                  >
                                    <option value="400">Regular</option>
                                    <option value="500">Medium</option>
                                    <option value="600">Semibold</option>
                                    <option value="700">Bold</option>
                                  </select>
                                </label>

                                <label className="min-w-[220px] flex-1">
                                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                                    Logo (URL)
                                  </span>
                                  <input
                                    value={editDraft.logoUrl}
                                    onChange={(event) =>
                                      setEditDraft((current) =>
                                        current ? { ...current, logoUrl: event.target.value } : current
                                      )
                                    }
                                    placeholder="https://..."
                                    className="w-full rounded-[var(--radius-card)] border border-hairline bg-white px-3 py-2 text-sm"
                                  />
                                </label>
                              </div>
                            </div>
                          ) : null}

                          <div className="flex-1 bg-[#F3EFEB] p-4">
                            {activeEditorFrameSrc ? (
                              <iframe
                                ref={previewFrameRef}
                                onLoad={bindPreviewFrame}
                                src={activeEditorFrameSrc}
                                title={
                                  previewTarget === "client"
                                    ? "Interfaccia cliente reale"
                                    : "Interfaccia staff reale"
                                }
                                className="h-full w-full rounded-[28px] border border-hairline bg-white shadow-[var(--shadow-soft)]"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-hairline bg-white p-8 text-center text-sm text-muted">
                                Crea almeno un tavolo per aprire il menu cliente reale.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
