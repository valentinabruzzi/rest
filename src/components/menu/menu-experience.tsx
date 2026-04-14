"use client";

import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/context/cart-context";
import {
  formatProductCustomerNoteSelections,
  type ProductCustomerNoteSelection,
} from "@/lib/product-customer-notes";
import { getLocalizedMenuItemName } from "@/lib/menu-item-name";
import {
  getCustomerPaymentStatusLabel,
  getCustomerRequestOptionLabel,
  getCustomerUiCopy,
  type CustomerUiCopy,
} from "@/lib/customer-i18n";
import {
  getRestaurantBranding,
  getRestaurantFontFamily,
  getRestaurantInterfaceSettings,
  RESTAURANT_LANGUAGE_OPTIONS,
  type RestaurantLanguageCode,
} from "@/lib/restaurant-branding";
import type { TableContext } from "@/types/menu";
import type { MenuCategory, MenuProduct } from "@/types/menu";
import type { CartLine } from "@/types/cart";
import type { RewardDetails } from "@/types/reward";
import type {
  StaffRequestOption,
  StaffRequestSummary,
} from "@/types/staff-request";
import { CategoryTabs } from "./category-tabs";
import { ProductListItem } from "./product-list-item";
import { ProductSheet } from "./product-sheet";
import { CartDrawer } from "./cart-drawer";
import { StripePaymentForm } from "./stripe-payment-form";
import { OrderStatusTracker } from "./order-status-tracker";
import { PaymentRewardWheel } from "./payment-reward-wheel";
import { MenuWaiterRequestSheet } from "./menu-waiter-request-sheet";
import { formatCents } from "@/lib/money";
import { WaiterCallPanel } from "@/components/order/waiter-call-panel";

const stripePk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePk ? loadStripe(stripePk) : null;
const ALL_CAT = "__all__";
const ADMIN_PREVIEW_HYDRATED_EVENT = "bb-admin-preview-hydrated";

function hexToRgba(hex: string | null | undefined, alpha: number) {
  const normalized = (hex ?? "").trim().replace("#", "");
  const safe =
    normalized.length === 3
      ? normalized
          .split("")
          .map((value) => value + value)
          .join("")
      : normalized;

  if (!/^[\da-fA-F]{6}$/.test(safe)) {
    return `rgba(110, 15, 31, ${alpha})`;
  }

  const red = Number.parseInt(safe.slice(0, 2), 16);
  const green = Number.parseInt(safe.slice(2, 4), 16);
  const blue = Number.parseInt(safe.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

type DoneOrderItem = {
  id: string;
  name: string;
  quantity: number;
  selectedNotes: ProductCustomerNoteSelection[];
  lineTotal: number;
  notes: string | null;
};

type Props = {
  restaurant?: string;
  restaurantName?: string;
  table?: string;
  token?: string;
  preview?: boolean;
  initialTableContext?: TableContext | null;
  initialCategories?: MenuCategory[];
  initialErrorMessage?: string | null;
  initialMenuLoaded?: boolean;
};

function LanguagePicker({
  copy,
  currentLanguage,
  enabledLanguages,
  onChange,
}: {
  copy: CustomerUiCopy;
  currentLanguage: RestaurantLanguageCode;
  enabledLanguages: RestaurantLanguageCode[];
  onChange: (language: RestaurantLanguageCode) => void;
}) {
  if (enabledLanguages.length <= 1) return null;

  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-hairline bg-canvas-elevated px-3 py-2 text-xs font-medium text-ink shadow-[var(--shadow-soft)]">
      <span className="text-muted">{copy.languageLabel}</span>
      <select
        value={currentLanguage}
        onChange={(event) => onChange(event.target.value as RestaurantLanguageCode)}
        className="bg-transparent text-xs font-medium text-ink outline-none"
      >
        {enabledLanguages.map((language) => {
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
  );
}

export function MenuExperience({
  restaurant,
  restaurantName,
  table,
  token,
  preview = false,
  initialTableContext = null,
  initialCategories = [],
  initialErrorMessage = null,
  initialMenuLoaded = false,
}: Props) {
  const {
    lines,
    addLine,
    updateQuantity,
    clear,
    subtotalCents,
    setStorageKey,
  } = useCart();

  const [loadState, setLoadState] = useState<"loading" | "error" | "ok">(
    initialTableContext ? "ok" : initialErrorMessage ? "error" : "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage
  );
  const [ctx, setCtx] = useState<TableContext | null>(initialTableContext);
  const [categories, setCategories] = useState<MenuCategory[]>(initialCategories);
  const [activeCat, setActiveCat] = useState<string>(ALL_CAT);
  const [search, setSearch] = useState("");
  const [sheetProduct, setSheetProduct] = useState<MenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [phase, setPhase] = useState<"welcome" | "menu" | "checkout" | "done">(
    "welcome"
  );
  const [welcomeSeen, setWelcomeSeen] = useState(false);

  const [payMode, setPayMode] = useState<"online" | "counter">("online");
  const [counterService, setCounterService] = useState<
    "cashier" | "waiter" | null
  >(null);
  const [counterWaiterPayment, setCounterWaiterPayment] = useState<
    "card" | "cash" | null
  >(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderSnapshot, setOrderSnapshot] = useState<{
    status: string;
    paymentStatus: string;
    waiterRequest: StaffRequestSummary | null;
  } | null>(null);
  const [customerNote, setCustomerNote] = useState("");
  const [rewardWheelOpen, setRewardWheelOpen] = useState(false);
  const [reward, setReward] = useState<RewardDetails | null>(null);
  const [doneOrderItems, setDoneOrderItems] = useState<DoneOrderItem[]>([]);
  const [doneOrderTotal, setDoneOrderTotal] = useState(0);
  const [menuWaiterSheetOpen, setMenuWaiterSheetOpen] = useState(false);
  const [menuWaiterRequestType, setMenuWaiterRequestType] =
    useState<StaffRequestOption | null>(null);
  const [menuWaiterSubmitting, setMenuWaiterSubmitting] = useState(false);
  const [menuWaiterError, setMenuWaiterError] = useState<string | null>(null);
  const [menuWaiterRequest, setMenuWaiterRequest] =
    useState<StaffRequestSummary | null>(null);
  const [currentLanguage, setCurrentLanguage] =
    useState<RestaurantLanguageCode>("it");
  const skipInitialTableFetchRef = useRef(
    !!initialTableContext || !!initialErrorMessage
  );
  const skipInitialMenuFetchRef = useRef(initialMenuLoaded);
  const previewOrderNumber = "PREVIEW-001";

  useEffect(() => {
    if (!preview) return;
    document.body.dataset.adminPreviewHydrated = "true";
    window.dispatchEvent(new Event(ADMIN_PREVIEW_HYDRATED_EVENT));

    return () => {
      delete document.body.dataset.adminPreviewHydrated;
    };
  }, [preview]);

  const serviceFeePercent = ctx?.restaurant.serviceFeePercent ?? 0;
  const serviceFeeCents = Math.round((subtotalCents * serviceFeePercent) / 100);
  const discountCents = 0;
  const grandTotalCents = subtotalCents - discountCents + serviceFeeCents;
  const restaurantPrimary = ctx?.restaurant.primaryColor ?? "#6E0F1F";
  const accentSoft = hexToRgba(restaurantPrimary, 0.08);
  const accentBorder = hexToRgba(restaurantPrimary, 0.18);
  const interfaceSettings = useMemo(
    () => getRestaurantInterfaceSettings(ctx?.restaurant.settings),
    [ctx?.restaurant.settings]
  );
  const branding = useMemo(
    () => getRestaurantBranding(ctx?.restaurant.theme, ctx?.restaurant.settings),
    [ctx?.restaurant.settings, ctx?.restaurant.theme]
  );
  const copy = useMemo(
    () => getCustomerUiCopy(currentLanguage),
    [currentLanguage]
  );
  const previewReward = useMemo<RewardDetails>(
    () => ({
      id: "preview-reward",
      sector: 0,
      prizeType: "none",
      wheelLabel: "Nessun premio",
      title: copy.noPrizeTitle,
      description: copy.noPrizeDescription,
      winner: false,
      code: null,
      redeemedAt: null,
      redeemable: false,
    }),
    [copy.noPrizeDescription, copy.noPrizeTitle]
  );
  const restaurantFontFamily = getRestaurantFontFamily(branding.fontPreset);
  const headingColor = branding.headingTextColor;
  const bodyColor = branding.bodyTextColor;

  const allowCounter = ctx?.restaurant.allowPayAtCounter ?? false;
  const allowOnlinePayment = interfaceSettings.allowOnlinePayment;
  const counterSelectionIncomplete =
    payMode === "counter" &&
    (!counterService ||
      (counterService === "waiter" && !counterWaiterPayment));

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (token) q.set("token", token);
    if (restaurant) q.set("restaurant", restaurant);
    if (restaurantName) q.set("name", restaurantName);
    if (table) q.set("table", table);
    return q.toString();
  }, [restaurant, restaurantName, table, token]);

  useEffect(() => {
    if (!ctx) return;
    setStorageKey(`bb_cart_${ctx.restaurant.id}_${ctx.table.id}`);
    const wkey = `bb_welcome_${ctx.restaurant.id}_${ctx.table.id}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(wkey)) {
      setWelcomeSeen(true);
      setPhase((current) => (current === "welcome" ? "menu" : current));
    }
  }, [ctx, setStorageKey]);

  useEffect(() => {
    if (skipInitialTableFetchRef.current) {
      skipInitialTableFetchRef.current = false;
      return;
    }

    let cancelled = false;
    async function run() {
      setLoadState("loading");
      setErrorMessage(null);
      try {
        const res = await fetch(`/api/table-context?${query}`);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) {
            setErrorMessage(
              data.error ??
                (currentLanguage === "en"
                  ? "Something went wrong."
                  : "Qualcosa e andato storto.")
            );
            setLoadState("error");
          }
          return;
        }
        if (!cancelled) {
          setCtx(data as TableContext);
          setLoadState("ok");
        }
      } catch {
        if (!cancelled) {
          setErrorMessage(
            currentLanguage === "en"
              ? "Could not reach the server."
              : "Impossibile raggiungere il server."
          );
          setLoadState("error");
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [currentLanguage, query]);

  useEffect(() => {
    if (!ctx || loadState !== "ok") return;
    if (skipInitialMenuFetchRef.current) {
      skipInitialMenuFetchRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/restaurants/${ctx.restaurant.slug}/menu?${new URLSearchParams({
            name: ctx.restaurant.name,
          }).toString()}`
        );
        const data = await res.json();
        if (!res.ok || cancelled) return;
        setCategories(data.categories ?? []);
        setActiveCat(ALL_CAT);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctx, loadState]);

  const effectiveLanguages = useMemo(() => {
    const base = interfaceSettings.enabledLanguages;
    const restaurantId = ctx?.restaurant.id ?? null;
    const storageKey = restaurantId ? `bb_langs_${restaurantId}` : null;
    if (typeof window === "undefined" || !restaurantId || !storageKey) {
      return { enabled: base, defaultLang: interfaceSettings.defaultLanguage };
    }
    try {
      const storedList = window.localStorage.getItem(storageKey);
      const parsed = storedList ? JSON.parse(storedList) : null;
      const list: RestaurantLanguageCode[] = Array.isArray(parsed)
        ? parsed
            .map((v) => v as RestaurantLanguageCode)
            .filter((v) => RESTAURANT_LANGUAGE_OPTIONS.some((opt) => opt.value === v))
        : base;
      const safeList = list.length > 0 ? list : base;
      const storedDefault =
        window.localStorage.getItem(`bb_lang_${restaurantId}`) ??
        interfaceSettings.defaultLanguage;
      const defaultLang = safeList.includes(storedDefault as RestaurantLanguageCode)
        ? (storedDefault as RestaurantLanguageCode)
        : safeList[0];
      return { enabled: safeList, defaultLang };
    } catch {
      return { enabled: base, defaultLang: interfaceSettings.defaultLanguage };
    }
  }, [ctx, interfaceSettings.defaultLanguage, interfaceSettings.enabledLanguages]);

  useEffect(() => {
    if (!ctx) return;

    const storageKey = `bb_lang_${ctx.restaurant.id}`;
    let nextLanguage = effectiveLanguages.defaultLang;

    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(storageKey);
      if (
        stored &&
        effectiveLanguages.enabled.includes(
          stored as RestaurantLanguageCode
        )
      ) {
        nextLanguage = stored as RestaurantLanguageCode;
      }
    }

    setCurrentLanguage(nextLanguage);
  }, [ctx, effectiveLanguages]);

  useEffect(() => {
    if (!ctx || typeof window === "undefined") return;
    window.localStorage.setItem(`bb_lang_${ctx.restaurant.id}`, currentLanguage);
  }, [ctx, currentLanguage]);

  useEffect(() => {
    if (!allowOnlinePayment && allowCounter) {
      setPayMode("counter");
      return;
    }
    if (!allowCounter && allowOnlinePayment) {
      setPayMode("online");
      setCounterService(null);
      setCounterWaiterPayment(null);
    }
  }, [allowCounter, allowOnlinePayment]);

  const localizedCategories = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        name:
          category.id === "__uncategorized__"
            ? copy.uncategorizedCategory
            : category.name,
        products: category.products.map((product) => ({
          ...product,
          name: getLocalizedMenuItemName({
            baseName: product.name,
            translations: product.nameTranslations,
            language: currentLanguage,
          }),
        })),
      })),
    [categories, copy.uncategorizedCategory, currentLanguage]
  );

  const tabCategories = useMemo(() => {
    const allTab: MenuCategory = {
      id: ALL_CAT,
      name: copy.allCategories,
      sortOrder: -1,
      products: [],
    };
    return [allTab, ...localizedCategories];
  }, [copy.allCategories, localizedCategories]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list: MenuProduct[] = [];
    for (const c of localizedCategories) {
      if (activeCat !== ALL_CAT && c.id !== activeCat) continue;
      for (const p of c.products) {
        if (!q) list.push(p);
        else if (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
        ) {
          list.push(p);
        }
      }
    }
    return list;
  }, [localizedCategories, activeCat, search]);

  const localizedSheetProduct = useMemo(
    () =>
      sheetProduct
        ? {
            ...sheetProduct,
            name: getLocalizedMenuItemName({
              baseName: sheetProduct.name,
              translations: sheetProduct.nameTranslations,
              language: currentLanguage,
            }),
          }
        : null,
    [currentLanguage, sheetProduct]
  );

  const productLinesMap = useMemo(() => {
    const grouped = new Map<string, CartLine[]>();
    const quantities = new Map<string, number>();
    const plainLines = new Map<string, CartLine>();

    for (const line of lines) {
      const existing = grouped.get(line.productId);
      if (existing) existing.push(line);
      else grouped.set(line.productId, [line]);

      quantities.set(
        line.productId,
        (quantities.get(line.productId) ?? 0) + line.quantity
      );

      if (
        line.selectedOptions.length === 0 &&
        line.selectedNotes.length === 0 &&
        !line.notes &&
        !plainLines.has(line.productId)
      ) {
        plainLines.set(line.productId, line);
      }
    }

    return {
      grouped,
      quantities,
      plainLines,
    };
  }, [lines]);

  const startMenu = useCallback(() => {
    if (!ctx) return;
    const wkey = `bb_welcome_${ctx.restaurant.id}_${ctx.table.id}`;
    sessionStorage.setItem(wkey, "1");
    setWelcomeSeen(true);
    setPhase("menu");
  }, [ctx]);

  const increaseProductQuantity = useCallback(
    (product: MenuProduct) => {
      const productLines = productLinesMap.grouped.get(product.id) ?? [];
      const plainLine = productLinesMap.plainLines.get(product.id);
      const singleLine = productLines.length === 1 ? productLines[0] : null;
      const requiresChoice = product.optionGroups.some((group) => group.required);

      if (plainLine) {
        updateQuantity(plainLine.id, plainLine.quantity + 1);
        return;
      }

      if (singleLine) {
        updateQuantity(singleLine.id, singleLine.quantity + 1);
        return;
      }

      if (requiresChoice) {
        setSheetProduct(product);
        return;
      }

      addLine({
        productId: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        unitPriceCents: product.price,
        quantity: 1,
        selectedOptions: [],
        selectedNotes: [],
        notes: null,
      });
    },
    [addLine, productLinesMap, updateQuantity]
  );

  const decreaseProductQuantity = useCallback(
    (productId: string) => {
      const productLines = productLinesMap.grouped.get(productId) ?? [];
      const plainLine = productLinesMap.plainLines.get(productId);
      const targetLine = plainLine ?? productLines[productLines.length - 1];

      if (!targetLine) return;
      updateQuantity(targetLine.id, targetLine.quantity - 1);
    },
    [productLinesMap, updateQuantity]
  );

  const buildPreviewRequest = useCallback(
    (
      args: {
        kind: "payment_request" | "table_assistance";
        requestType: StaffRequestOption | null;
        title: string;
        detail: string;
        orderId?: string | null;
        orderNumber?: string | null;
      }
    ): StaffRequestSummary => ({
      id: `preview-request-${Date.now()}`,
      type: "waiter_call",
      kind: args.kind,
      requestType: args.requestType,
      requestTypeLabel: args.requestType ?? "assistance",
      title: args.title,
      detail: args.detail,
      note: "Preview mode",
      status: "new",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
      restaurantName: ctx?.restaurant.name ?? "Preview",
      tableNumber: ctx?.table.tableNumber ?? "-",
      orderId: args.orderId ?? null,
      orderNumber: args.orderNumber ?? null,
    }),
    [ctx?.restaurant.name, ctx?.table.tableNumber]
  );

  const submitOrder = useCallback(async () => {
    if (!ctx) return;
    if (payMode === "counter" && !counterService) {
      setCheckoutError(copy.chooseCounterModeError);
      return;
    }
    if (
      payMode === "counter" &&
      counterService === "waiter" &&
      !counterWaiterPayment
    ) {
      setCheckoutError(copy.chooseTablePaymentError);
      return;
    }
    setCheckoutError(null);
    setCheckoutLoading(true);
    setReward(null);
    setRewardWheelOpen(false);
    const orderItems = lines.map((line) => ({
      id: line.id,
      name: line.name,
      quantity: line.quantity,
      selectedNotes: line.selectedNotes,
      notes: line.notes,
      lineTotal:
        (line.unitPriceCents +
          line.selectedOptions.reduce((sum, option) => sum + option.priceDeltaCents, 0)) *
        line.quantity,
    }));

    if (preview) {
      const previewOrderId = `preview-order-${Date.now()}`;
      const previewWaiterRequest =
        payMode === "counter" && counterService === "waiter"
          ? buildPreviewRequest({
              kind: "payment_request",
              requestType:
                counterWaiterPayment === "card"
                  ? "payment_card"
                  : counterWaiterPayment === "cash"
                    ? "payment_cash"
                    : null,
              title:
                currentLanguage === "en"
                  ? "Table payment"
                  : "Pagamento al tavolo",
              detail:
                counterWaiterPayment === "card"
                  ? currentLanguage === "en"
                    ? "Preview: table card payment"
                    : "Preview: pagamento al tavolo con carta"
                  : currentLanguage === "en"
                    ? "Preview: table cash payment"
                    : "Preview: pagamento al tavolo con contanti",
              orderId: previewOrderId,
              orderNumber: previewOrderNumber,
            })
          : payMode === "counter" && counterService === "cashier"
            ? buildPreviewRequest({
                kind: "payment_request",
                requestType: "payment_counter",
                title:
                  currentLanguage === "en"
                    ? "Counter payment"
                    : "Pagamento cassa",
                detail:
                  currentLanguage === "en"
                    ? "Preview: counter payment request"
                    : "Preview: richiesta pagamento cassa",
                orderId: previewOrderId,
                orderNumber: previewOrderNumber,
              })
            : null;

      setOrderId(previewOrderId);
      setOrderNumber(previewOrderNumber);
      setDoneOrderItems(orderItems);
      setDoneOrderTotal(grandTotalCents);

      if (payMode === "counter") {
        clear();
        setClientSecret(null);
        setReward(null);
        setOrderSnapshot({
          status: "placed_unpaid",
          paymentStatus: "pending",
          waiterRequest: previewWaiterRequest,
        });
        setPhase("done");
        setCartOpen(false);
        setCheckoutLoading(false);
        return;
      }

      setClientSecret("__preview__");
      setCheckoutLoading(false);
      return;
    }

    try {
      const items = lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        selectedNotes: l.selectedNotes,
        notes: l.notes,
        selectedOptions: l.selectedOptions.map((o) => ({
          groupId: o.groupId,
          groupName: o.groupName,
          optionIds: o.optionIds,
          labels: o.labels,
          priceDeltaCents: o.priceDeltaCents,
        })),
      }));

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug: ctx.restaurant.slug,
          restaurantName: ctx.restaurant.name,
          tableId: ctx.table.id,
          customerNote: customerNote.trim() || null,
          language: currentLanguage,
          payMode,
          counterService: payMode === "counter" ? counterService : undefined,
          counterWaiterPayment:
            payMode === "counter" && counterService === "waiter"
              ? counterWaiterPayment
              : undefined,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCheckoutError(data.error ?? copy.orderFailed);
        setCheckoutLoading(false);
        return;
      }
      setOrderId(data.orderId);
      setOrderNumber(data.orderNumber);
      setDoneOrderItems(orderItems);
      setDoneOrderTotal(data.total);
      if (payMode === "counter") {
        clear();
        setClientSecret(null);
        setReward(null);
        setOrderSnapshot({
          status: data.status ?? "placed_unpaid",
          paymentStatus: data.paymentStatus ?? "pending",
          waiterRequest: data.waiterRequest ?? null,
        });
        setPhase("done");
        setCartOpen(false);
      } else {
        if (!data.clientSecret) {
          setCheckoutError(copy.paymentInitError);
          setCheckoutLoading(false);
          return;
        }
        setClientSecret(data.clientSecret);
      }
    } catch {
      setCheckoutError(copy.networkError);
    }
    setCheckoutLoading(false);
  }, [
    clear,
    copy.chooseCounterModeError,
    copy.chooseTablePaymentError,
    copy.networkError,
    copy.orderFailed,
    copy.paymentInitError,
    counterService,
    counterWaiterPayment,
    ctx,
    customerNote,
    buildPreviewRequest,
    grandTotalCents,
    lines,
    payMode,
    preview,
    previewOrderNumber,
    currentLanguage,
  ]);

  const onPaymentSuccess = useCallback((nextReward: RewardDetails | null) => {
    const paidOrderId = orderId;
    clear();
    setClientSecret(null);
    setReward(nextReward);
    setOrderSnapshot({
      status: "paid",
      paymentStatus: "paid_online",
      waiterRequest: null,
    });
    setPhase("done");
    setCartOpen(false);
    if (
      paidOrderId &&
      nextReward &&
      typeof window !== "undefined" &&
      !window.sessionStorage.getItem(`bb_reward_seen_${paidOrderId}`)
    ) {
      setRewardWheelOpen(true);
    }
  }, [clear, orderId]);

  const refreshOrder = useCallback(async () => {
    if (preview) return;
    if (!orderId) return;
    const res = await fetch(`/api/orders/${orderId}`);
    if (!res.ok) return;
    const data = await res.json();
    setOrderSnapshot({
      status: data.status,
      paymentStatus: data.paymentStatus,
      waiterRequest: data.waiterRequest ?? null,
    });
  }, [orderId, preview]);

  const refreshMenuWaiterRequest = useCallback(async () => {
    if (preview || !ctx) return;
    const res = await fetch(`/api/tables/${ctx.table.id}/waiter-call`);
    if (!res.ok) return;
    const data = await res.json();
    setMenuWaiterRequest(data.request ?? null);
  }, [ctx, preview]);

  const closeRewardWheel = useCallback(() => {
    if (orderId && typeof window !== "undefined") {
      window.sessionStorage.setItem(`bb_reward_seen_${orderId}`, "1");
    }
    setRewardWheelOpen(false);
    setReward(null);
  }, [orderId]);

  const submitMenuWaiterRequest = useCallback(async () => {
    if (!ctx) return;

    setMenuWaiterSubmitting(true);
    setMenuWaiterError(null);
    if (preview) {
      setMenuWaiterRequest(
        buildPreviewRequest({
          kind: "table_assistance",
          requestType: menuWaiterRequestType,
          title: currentLanguage === "en" ? "Waiter request" : "Richiesta cameriere",
          detail:
            currentLanguage === "en"
              ? "Preview: simulated waiter request"
              : "Preview: richiesta cameriere simulata",
        })
      );
      setMenuWaiterRequestType(null);
      setMenuWaiterSheetOpen(false);
      setMenuWaiterSubmitting(false);
      return;
    }
    try {
      const res = await fetch(`/api/tables/${ctx.table.id}/waiter-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: menuWaiterRequestType,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMenuWaiterError(data.error ?? copy.networkError);
        return;
      }

      setMenuWaiterRequest(data.request ?? null);
      setMenuWaiterRequestType(null);
      setMenuWaiterSheetOpen(false);
    } catch {
      setMenuWaiterError(copy.networkError);
    } finally {
      setMenuWaiterSubmitting(false);
    }
  }, [
    buildPreviewRequest,
    copy.networkError,
    ctx,
    currentLanguage,
    menuWaiterRequestType,
    preview,
  ]);

  const activeMenuWaiterRequestLabel = useMemo(() => {
    if (!menuWaiterRequest) return null;
    if (menuWaiterRequest.requestType) {
      return getCustomerRequestOptionLabel(
        menuWaiterRequest.requestType,
        currentLanguage
      );
    }
    if (menuWaiterRequest.kind === "payment_request") {
      if (menuWaiterRequest.requestType === "payment_counter") {
        return currentLanguage === "en"
          ? "Counter payment"
          : "Pagamento cassa";
      }
      return currentLanguage === "en"
        ? "Table payment"
        : "Pagamento al tavolo";
    }
    return currentLanguage === "en"
      ? "General assistance"
      : "Assistenza generica";
  }, [currentLanguage, menuWaiterRequest]);

  useEffect(() => {
    if (preview || !orderId) return;
    void refreshOrder();
    const timer = setInterval(refreshOrder, 5000);
    return () => clearInterval(timer);
  }, [orderId, preview, refreshOrder]);

  useEffect(() => {
    if (preview || !ctx) return;
    void refreshMenuWaiterRequest();
    if (phase !== "menu") return;
    const timer = setInterval(refreshMenuWaiterRequest, 5000);
    return () => clearInterval(timer);
  }, [ctx, phase, preview, refreshMenuWaiterRequest]);

  if (loadState === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm text-muted">{copy.loading}</p>
      </div>
    );
  }

  if (loadState === "error" || !ctx) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="text-xl font-semibold text-ink">{copy.errorTitle}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {errorMessage ?? copy.scanQrHelp}
        </p>
        <Link
          href="/"
          className="mt-8 text-sm font-medium text-bordeaux underline-offset-4 hover:underline"
        >
          {copy.back}
        </Link>
      </div>
    );
  }

  if (phase === "welcome" && !welcomeSeen) {
    return (
      <div
        className="mx-auto flex min-h-dvh max-w-lg flex-col justify-between px-6 py-12"
        style={{ fontFamily: restaurantFontFamily }}
        data-admin-font-scope="true"
      >
        <div>
          <div className="flex justify-end">
          <LanguagePicker
            copy={copy}
            currentLanguage={currentLanguage}
            enabledLanguages={effectiveLanguages.enabled}
            onChange={setCurrentLanguage}
          />
          </div>
          <p
            className="text-xs font-medium uppercase tracking-[0.2em] text-muted"
            data-admin-field="welcomeLabel"
            data-admin-role="body"
            style={{
              color: branding.textColorOverrides.welcomeLabel ?? bodyColor,
            }}
          >
            {copy.welcomeLabel}
          </p>
          {ctx.restaurant.logoUrl ? (
            <div className="relative mt-6 h-14 w-14 overflow-hidden rounded-2xl border border-hairline bg-canvas-elevated shadow-[var(--shadow-soft)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ctx.restaurant.logoUrl}
                alt={ctx.restaurant.name}
                className="h-full w-full object-cover"
                data-admin-field="logo"
              />
            </div>
          ) : null}
          <h1
            className="mt-4 text-3xl font-semibold tracking-tight"
            style={{ color: branding.textColorOverrides.name ?? headingColor }}
            data-admin-field="name"
            data-admin-role="heading"
          >
            {ctx.restaurant.name}
          </h1>
          <p className="mt-2 text-lg" style={{ color: bodyColor }} data-admin-role="body">
            {copy.tableLabel} {ctx.table.tableNumber}
          </p>
          <p
            className="mt-8 text-sm leading-relaxed"
            style={{
              color: branding.textColorOverrides.welcomeDescription ?? bodyColor,
            }}
            data-admin-field="welcomeDescription"
            data-admin-role="body"
          >
            {copy.welcomeDescription}
          </p>
        </div>
        <button
          type="button"
          onClick={startMenu}
          className="w-full rounded-[var(--radius-card)] py-4 text-sm font-medium text-white shadow-[var(--shadow-soft)] transition"
          style={{ backgroundColor: restaurantPrimary }}
        >
          {copy.viewMenu}
        </button>
      </div>
    );
  }

  return (
    <div
      className="mx-auto min-h-dvh max-w-lg pb-28"
      style={{ fontFamily: restaurantFontFamily }}
      data-admin-font-scope="true"
    >
      {phase === "menu" ? (
        <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/95 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p
                className="text-xs font-medium uppercase tracking-[0.2em] text-muted"
                data-admin-field="menuLabel"
                data-admin-role="body"
                style={{
                  color: branding.textColorOverrides.menuLabel ?? bodyColor,
                }}
              >
                {copy.menuLabel}
              </p>
              <div className="mt-1 flex items-center gap-3">
                {ctx.restaurant.logoUrl ? (
                  <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-hairline bg-canvas-elevated shadow-[var(--shadow-soft)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ctx.restaurant.logoUrl}
                      alt={ctx.restaurant.name}
                      className="h-full w-full object-cover"
                      data-admin-field="logo"
                    />
                  </div>
                ) : null}
                <h1
                  className="text-lg font-semibold tracking-tight"
                  style={{ color: branding.textColorOverrides.name ?? headingColor }}
                  data-admin-field="name"
                  data-admin-role="heading"
                >
                  {ctx.restaurant.name}
                </h1>
              </div>
              <p className="text-sm" style={{ color: bodyColor }} data-admin-role="body">
                {copy.tableLabel} {ctx.table.tableNumber}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <LanguagePicker
                copy={copy}
                currentLanguage={currentLanguage}
                enabledLanguages={interfaceSettings.enabledLanguages}
                onChange={setCurrentLanguage}
              />
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="relative rounded-full border border-hairline bg-canvas-elevated px-4 py-2 text-xs font-medium text-ink shadow-[var(--shadow-soft)]"
                style={{ borderColor: accentBorder }}
              >
                {copy.yourOrder}
                {lines.length > 0 ? (
                  <span
                    className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: restaurantPrimary }}
                  >
                    {lines.reduce((s, l) => s + l.quantity, 0)}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </header>
      ) : null}

      {phase === "checkout" ? (
        <header className="border-b border-hairline bg-canvas px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
                {ctx.restaurant.name}
              </p>
              <p className="text-sm text-muted">
                {copy.tableLabel} {ctx.table.tableNumber}
              </p>
            </div>
            <LanguagePicker
              copy={copy}
              currentLanguage={currentLanguage}
              enabledLanguages={interfaceSettings.enabledLanguages}
              onChange={setCurrentLanguage}
            />
          </div>
        </header>
      ) : null}

      {phase === "menu" && (
        <>
          <div className="px-5 pt-4">
            <button
              type="button"
              onClick={() => {
                setMenuWaiterError(null);
                setMenuWaiterSheetOpen(true);
              }}
              className="w-full rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated px-4 py-3 text-left shadow-[var(--shadow-soft)]"
              style={{ borderColor: accentBorder }}
            >
              <span className="block text-sm font-medium text-ink">
                {copy.callWaiter}
              </span>
              <span
                className="mt-1 block text-xs leading-relaxed text-muted"
                data-admin-role="body"
              >
                {copy.waiterIntro}
              </span>
              {menuWaiterRequest ? (
                <span className="mt-2 block text-xs font-medium uppercase tracking-[0.16em] text-bordeaux">
                  {copy.activeRequest}: {activeMenuWaiterRequestLabel}
                </span>
              ) : null}
            </button>
          </div>
          <div className="px-5 pt-4">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={copy.searchPlaceholder}
              className="w-full rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated px-4 py-3 text-sm text-ink outline-none ring-bordeaux/20 placeholder:text-muted focus:ring-2"
            />
          </div>
          <div className="sticky top-[5.25rem] z-20 border-b border-hairline/80 bg-canvas/95 px-5 py-3 backdrop-blur-sm">
            <CategoryTabs
              categories={tabCategories}
              activeId={activeCat}
              onSelect={setActiveCat}
            />
          </div>
          <div className="flex flex-col gap-3 px-5 py-4">
            {filteredProducts.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">
                {copy.noItemsFound}
              </p>
            ) : (
              filteredProducts.map((p) => (
                <ProductListItem
                  key={p.id}
                  product={p}
                  currency={ctx.restaurant.currency}
                  copy={copy}
                  onOpen={() => setSheetProduct(p)}
                  quantity={productLinesMap.quantities.get(p.id) ?? 0}
                  onIncrement={() => increaseProductQuantity(p)}
                  onDecrement={() => decreaseProductQuantity(p.id)}
                />
              ))
            )}
          </div>
        </>
      )}

      {phase === "checkout" && (
        <div className="px-5 py-6">
          <button
            type="button"
            onClick={() => {
              setPhase("menu");
              setCheckoutError(null);
              setClientSecret(null);
            }}
            className="text-sm font-medium text-muted hover:text-ink"
          >
            {copy.checkoutBack}
          </button>
          <h2
            className="mt-6 text-xl font-semibold tracking-tight"
            style={{ color: headingColor }}
            data-admin-role="heading"
          >
            {copy.checkoutTitle}
          </h2>
          <p className="mt-1 text-sm" style={{ color: bodyColor }} data-admin-role="body">
            {copy.tableLabel} {ctx.table.tableNumber} ·{" "}
            {formatCents(grandTotalCents, ctx.restaurant.currency)}
          </p>

          <div className="mt-6 space-y-3 rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-4 shadow-[var(--shadow-soft)]">
            {lines.map((l) => (
              <div
                key={l.id}
                className="flex justify-between gap-3 border-b border-hairline pb-3 text-sm last:border-0 last:pb-0"
              >
                <span className="text-ink">
                  {l.quantity}× {l.name}
                  {l.selectedNotes.length > 0 ? (
                    <span className="mt-0.5 block text-xs text-muted">
                      {copy.selectedNotes}:{" "}
                      {formatProductCustomerNoteSelections(l.selectedNotes)}
                    </span>
                  ) : null}
                  {l.notes ? (
                    <span className="mt-0.5 block text-xs italic text-muted">
                      {l.notes}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {formatCents(
                    (l.unitPriceCents +
                      l.selectedOptions.reduce((s, o) => s + o.priceDeltaCents, 0)) *
                      l.quantity,
                    ctx.restaurant.currency
                  )}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-sm text-muted">
              <span>{copy.subtotal}</span>
              <span className="tabular-nums text-ink">
                {formatCents(subtotalCents, ctx.restaurant.currency)}
              </span>
            </div>
            {serviceFeeCents > 0 ? (
              <div className="flex justify-between text-sm text-muted">
                <span>{copy.service}</span>
                <span className="tabular-nums text-ink">
                  {formatCents(serviceFeeCents, ctx.restaurant.currency)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-hairline pt-3 text-base font-semibold text-ink">
              <span>{copy.total}</span>
              <span className="tabular-nums">
                {formatCents(grandTotalCents, ctx.restaurant.currency)}
              </span>
            </div>
          </div>

          <label className="mt-6 block">
            <span className="text-sm font-medium text-ink">{copy.noteForVenue}</span>
            <textarea
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              rows={2}
              maxLength={1000}
              className="mt-2 w-full resize-none rounded-[var(--radius-card)] border border-hairline bg-canvas px-3 py-2 text-sm outline-none ring-bordeaux/20 focus:ring-2"
              placeholder={copy.optional}
            />
          </label>

          <p className="mt-6 text-sm font-medium text-ink">{copy.paymentTitle}</p>
          <div className="mt-3 rounded-[var(--radius-card)] border border-bordeaux/10 bg-bordeaux/5 px-4 py-3 text-sm leading-relaxed text-muted">
            {copy.paymentIntro}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {allowOnlinePayment ? (
              <button
                type="button"
                onClick={() => {
                  setPayMode("online");
                  setCheckoutError(null);
                }}
                className={
                  payMode === "online"
                    ? "rounded-[var(--radius-card)] border px-4 py-3 text-left text-sm text-ink"
                    : "rounded-[var(--radius-card)] border border-hairline px-4 py-3 text-left text-sm text-ink"
                }
                style={
                  payMode === "online"
                    ? {
                        borderColor: restaurantPrimary,
                        backgroundColor: accentSoft,
                      }
                    : undefined
                }
              >
                {copy.onlinePaymentOption}
              </button>
            ) : null}
            {allowCounter ? (
              <button
                type="button"
                onClick={() => {
                  setPayMode("counter");
                  setCheckoutError(null);
                }}
                className={
                  payMode === "counter"
                    ? "rounded-[var(--radius-card)] border px-4 py-3 text-left text-sm text-ink"
                    : "rounded-[var(--radius-card)] border border-hairline px-4 py-3 text-left text-sm text-ink"
                }
                style={
                  payMode === "counter"
                    ? {
                        borderColor: restaurantPrimary,
                        backgroundColor: accentSoft,
                      }
                    : undefined
                }
              >
                {copy.counterPaymentOption}
              </button>
            ) : null}
          </div>

          {payMode === "counter" ? (
            <div className="mt-4 rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-4 shadow-[var(--shadow-soft)]">
              <p className="text-sm font-medium text-ink">
                {copy.counterModeTitle}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setCounterService("cashier");
                    setCounterWaiterPayment(null);
                    setCheckoutError(null);
                  }}
                  className={
                    counterService === "cashier"
                      ? "rounded-[var(--radius-card)] border px-4 py-3 text-left text-sm text-ink"
                      : "rounded-[var(--radius-card)] border border-hairline bg-white px-4 py-3 text-left text-sm text-ink"
                  }
                  style={
                    counterService === "cashier"
                      ? {
                          borderColor: restaurantPrimary,
                          backgroundColor: accentSoft,
                        }
                      : undefined
                  }
                >
                  <span className="block font-medium text-ink">
                    {copy.goToCashier}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">
                    {copy.goToCashierDetail}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCounterService("waiter");
                    setCheckoutError(null);
                  }}
                  className={
                    counterService === "waiter"
                      ? "rounded-[var(--radius-card)] border px-4 py-3 text-left text-sm text-ink"
                      : "rounded-[var(--radius-card)] border border-hairline bg-white px-4 py-3 text-left text-sm text-ink"
                  }
                  style={
                    counterService === "waiter"
                      ? {
                          borderColor: restaurantPrimary,
                          backgroundColor: accentSoft,
                        }
                      : undefined
                  }
                >
                  <span className="block font-medium text-ink">
                    {copy.callWaiterForPayment}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">
                    {copy.callWaiterForPaymentDetail}
                  </span>
                </button>
              </div>

              {counterService === "waiter" ? (
                <div className="mt-4">
                  <p className="text-sm font-medium text-ink">
                    {copy.tablePaymentMethod}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCounterWaiterPayment("card");
                        setCheckoutError(null);
                      }}
                      className={
                        counterWaiterPayment === "card"
                          ? "rounded-[var(--radius-card)] border px-4 py-3 text-left text-sm text-ink"
                          : "rounded-[var(--radius-card)] border border-hairline bg-white px-4 py-3 text-left text-sm text-ink"
                      }
                      style={
                        counterWaiterPayment === "card"
                          ? {
                              borderColor: restaurantPrimary,
                              backgroundColor: accentSoft,
                            }
                          : undefined
                      }
                    >
                      {copy.card}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCounterWaiterPayment("cash");
                        setCheckoutError(null);
                      }}
                      className={
                        counterWaiterPayment === "cash"
                          ? "rounded-[var(--radius-card)] border px-4 py-3 text-left text-sm text-ink"
                          : "rounded-[var(--radius-card)] border border-hairline bg-white px-4 py-3 text-left text-sm text-ink"
                      }
                      style={
                        counterWaiterPayment === "cash"
                          ? {
                              borderColor: restaurantPrimary,
                              backgroundColor: accentSoft,
                            }
                          : undefined
                      }
                    >
                      {copy.cash}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {!stripePk && payMode === "online" && allowOnlinePayment ? (
            <p className="mt-4 text-sm text-bordeaux">
              {copy.onlinePaymentDisabled}
            </p>
          ) : null}

          {checkoutError ? (
            <p className="mt-4 text-sm text-bordeaux">{checkoutError}</p>
          ) : null}

          {!clientSecret && (
            <button
              type="button"
              disabled={
                checkoutLoading ||
                lines.length === 0 ||
                (payMode === "online" && !stripePk) ||
                counterSelectionIncomplete
              }
              onClick={submitOrder}
              className="mt-6 w-full rounded-[var(--radius-card)] py-3.5 text-sm font-medium text-white shadow-[var(--shadow-soft)] transition disabled:opacity-40"
              style={{ backgroundColor: restaurantPrimary }}
            >
              {checkoutLoading
                ? copy.placingOrder
                : payMode === "counter"
                  ? counterService === "cashier"
                    ? copy.confirmCashier
                    : copy.confirmWaiter
                  : copy.continueToPayment}
            </button>
          )}

          {clientSecret && orderId && preview ? (
            <div className="mt-8">
              <StripePaymentForm
                preview
                orderId={orderId}
                copy={copy}
                onSuccess={onPaymentSuccess}
                previewReward={previewReward}
              />
            </div>
          ) : null}

          {clientSecret && orderId && stripePromise && !preview ? (
            <div className="mt-8">
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: "stripe",
                    variables: {
                      colorPrimary: restaurantPrimary,
                      borderRadius: "10px",
                      fontFamily: "var(--font-manrope), system-ui, sans-serif",
                    },
                  },
                  locale: currentLanguage,
                }}
              >
                <StripePaymentForm
                  orderId={orderId}
                  copy={copy}
                  onSuccess={onPaymentSuccess}
                  preview={false}
                  previewReward={null}
                />
              </Elements>
            </div>
          ) : null}
        </div>
      )}

      {phase === "done" && orderNumber && (
        <div className="px-5 py-10">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
              {ctx.restaurant.name}
            </p>
            <LanguagePicker
              copy={copy}
              currentLanguage={currentLanguage}
              enabledLanguages={interfaceSettings.enabledLanguages}
              onChange={setCurrentLanguage}
            />
          </div>
          <h2
            className="mt-3 text-2xl font-semibold tracking-tight"
            style={{ color: headingColor }}
            data-admin-role="heading"
          >
            {copy.orderTitle} #{orderNumber}
          </h2>
          <p className="mt-2 text-sm" style={{ color: bodyColor }} data-admin-role="body">
            {copy.tableLabel} {ctx.table.tableNumber}
          </p>
          <p className="mt-4 text-sm text-muted">
            {copy.paymentLabel}:{" "}
            <span className="font-medium text-ink">
              {getCustomerPaymentStatusLabel(
                orderSnapshot?.paymentStatus ?? "pending",
                currentLanguage
              )}
            </span>
          </p>
          {orderSnapshot ? (
            <OrderStatusTracker
              status={orderSnapshot.status}
              language={currentLanguage}
            />
          ) : null}
          {orderId && orderSnapshot ? (
            <WaiterCallPanel
              orderId={orderId}
              language={currentLanguage}
              waiterRequest={orderSnapshot.waiterRequest}
              preview={preview}
              onRequestChange={(nextRequest) =>
                setOrderSnapshot((current) =>
                  current
                    ? {
                        ...current,
                        waiterRequest: nextRequest,
                      }
                    : current
                )
              }
            />
          ) : null}
          <div className="mt-8 rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-4 shadow-[var(--shadow-soft)]">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              {copy.itemsTitle}
            </p>
            <ul className="mt-3 space-y-3">
              {doneOrderItems.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 text-sm">
                  <span>
                    {item.quantity}× {item.name}
                    {item.selectedNotes.length > 0 ? (
                      <span className="mt-0.5 block text-xs text-muted">
                        {copy.selectedNotes}:{" "}
                        {formatProductCustomerNoteSelections(item.selectedNotes)}
                      </span>
                    ) : null}
                    {item.notes ? (
                      <span className="mt-0.5 block text-xs italic text-muted">
                        {item.notes}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {formatCents(item.lineTotal, ctx.restaurant.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-hairline pt-3 text-sm font-semibold">
              <span>{copy.total}</span>
              <span className="tabular-nums">
                {formatCents(doneOrderTotal, ctx.restaurant.currency)}
              </span>
            </div>
          </div>
        <Link
          href="/"
          className="mt-8 block rounded-[var(--radius-card)] bg-bordeaux py-3 text-center text-sm font-medium text-white"
        >
          {copy.home}
        </Link>
      </div>
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        currency={ctx.restaurant.currency}
        copy={copy}
        serviceFeeCents={serviceFeeCents}
        discountCents={discountCents}
        grandTotalCents={grandTotalCents}
        onCheckout={() => {
          setCartOpen(false);
          setPhase("checkout");
        }}
      />

      {localizedSheetProduct ? (
        <ProductSheet
          product={localizedSheetProduct}
          currency={ctx.restaurant.currency}
          copy={copy}
          onClose={() => setSheetProduct(null)}
          onAdd={({ quantity, selectedNotes, notes, selectedOptions }) => {
            const line: Omit<CartLine, "id"> = {
              productId: localizedSheetProduct.id,
              name: localizedSheetProduct.name,
              imageUrl: localizedSheetProduct.imageUrl,
              unitPriceCents: localizedSheetProduct.price,
              quantity,
              selectedOptions,
              selectedNotes,
              notes,
            };
            addLine(line);
            setSheetProduct(null);
          }}
        />
      ) : null}

      <MenuWaiterRequestSheet
        open={menuWaiterSheetOpen}
        copy={copy}
        language={currentLanguage}
        selectedRequestType={menuWaiterRequestType}
        submitting={menuWaiterSubmitting}
        error={menuWaiterError}
        onClose={() => {
          setMenuWaiterSheetOpen(false);
          setMenuWaiterError(null);
        }}
        onSelect={setMenuWaiterRequestType}
        onSubmit={submitMenuWaiterRequest}
      />

      {rewardWheelOpen && reward ? (
        <PaymentRewardWheel
          open={rewardWheelOpen}
          language={currentLanguage}
          reward={reward}
          onComplete={closeRewardWheel}
        />
      ) : null}
    </div>
  );
}
