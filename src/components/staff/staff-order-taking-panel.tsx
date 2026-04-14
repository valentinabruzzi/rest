"use client";

import { useEffect, useMemo, useState } from "react";
import { CategoryTabs } from "@/components/menu/category-tabs";
import { ProductSheet } from "@/components/menu/product-sheet";
import { getCustomerUiCopy } from "@/lib/customer-i18n";
import { getLocalizedMenuItemName } from "@/lib/menu-item-name";
import { formatProductCustomerNoteSelections } from "@/lib/product-customer-notes";
import { formatCents } from "@/lib/money";
import { createRestaurantIdentityKey } from "@/lib/restaurant-directory";
import { recordRuntimeMetric } from "@/lib/runtime-metrics";
import {
  fetchJsonWithRetry,
  getRuntimeCircuitKey,
  getRuntimeCircuitMode,
  recordRuntimeCircuitFailure,
  recordRuntimeCircuitSuccess,
} from "@/lib/runtime-resilience";
import type {
  StaffBufferedCreateOrderItem,
  StaffBufferedPaymentLocation,
  StaffBufferedPaymentMethod,
  StaffBufferedUiLanguage,
} from "@/lib/staff-buffer";
import type { MenuCategory, MenuProduct } from "@/types/menu";
import { cartSubtotal, lineSubtotal, type CartLine } from "@/types/cart";
import type { StaffTableRow } from "@/lib/staff-view-data";

const DEFAULT_PANEL_OPEN = true;

type StaffUiLanguage = "it" | "en";
type PaymentLocation = "cashier" | "table";
type PaymentMethod = "card" | "cash";
type StaffTable = StaffTableRow;

type Copy = {
  title: string;
  openPanel: string;
  closePanel: string;
  info: string;
  loading: string;
  loadError: string;
  tableLabel: string;
  tablePlaceholder: string;
  paymentLabel: string;
  paymentLocationLabel: string;
  payAtCounter: string;
  payAtTable: string;
  payAtCounterHelp: string;
  payAtTableHelp: string;
  methodLabel: string;
  card: string;
  cash: string;
  search: string;
  products: string;
  noProducts: string;
  emptyDraft: string;
  draftTitle: string;
  confirm: string;
  creating: string;
  created: (orderNumber: string) => string;
  selectTableError: string;
  selectPaymentFlowError: string;
  selectPaymentMethodError: string;
  addItemsError: string;
  submitError: string;
  productInfo: string;
  quantityLabel: string;
  totalLabel: string;
  serviceLabel: string;
  searchPlaceholder: string;
  stepHelp: string;
  detailsLabel: string;
  configureLabel: string;
  buffered: string;
  syncing: (count: number) => string;
};

const PANEL_COPY: Record<StaffUiLanguage, Copy> = {
  it: {
    title: "Nuovi ordini",
    openPanel: "Apri",
    closePanel: "Chiudi",
    info: "menu rapido per inserire ordini gia incassati: confermi solo dopo il pagamento e il ticket parte subito in lavorazione",
    loading: "Caricamento menu interno…",
    loadError: "Impossibile caricare tavoli o menu.",
    tableLabel: "Tavolo",
    tablePlaceholder: "Scegli tavolo",
    paymentLabel: "Pagamento",
    paymentLocationLabel: "Cassa / tavolo",
    payAtCounter: "Cassa",
    payAtTable: "Tavolo",
    payAtCounterHelp: "l'incasso e gia stato completato in cassa",
    payAtTableHelp: "l'incasso e gia stato completato al tavolo",
    methodLabel: "Metodo pagamento",
    card: "Carta",
    cash: "Contanti",
    search: "Cerca",
    products: "Prodotti",
    noProducts: "Nessun prodotto corrisponde ai filtri.",
    emptyDraft: "Aggiungi prodotti per creare un ordine.",
    draftTitle: "Riepilogo ordine",
    confirm: "Conferma ordine e avvenuto pagamento",
    creating: "Creazione…",
    created: (orderNumber) => `Ordine pagato creato: #${orderNumber}`,
    selectTableError: "Scegli il tavolo prima di confermare.",
    selectPaymentFlowError: "Scegli dove hai incassato.",
    selectPaymentMethodError: "Scegli il metodo di pagamento.",
    addItemsError: "Aggiungi almeno un prodotto all'ordine.",
    submitError: "Impossibile creare l'ordine.",
    productInfo:
      "usa i pulsanti +/- a destra per aggiungere subito; apri dettagli solo se ti servono foto, opzioni o note",
    quantityLabel: "pezzi",
    totalLabel: "Totale stimato",
    serviceLabel: "Servizio",
    searchPlaceholder: "Cerca prodotto",
    stepHelp: "conferma solo dopo l'incasso: l'ordine entra subito in bar e kitchen senza passaggi duplicati",
    detailsLabel: "Dettagli",
    configureLabel: "Configura",
    buffered: "Ordine salvato nel buffer del dispositivo. Lo invio appena rete e database tornano disponibili.",
    syncing: (count) =>
      count === 1
        ? "1 azione in buffer"
        : `${count} azioni in buffer`,
  },
  en: {
    title: "New orders",
    openPanel: "Open",
    closePanel: "Close",
    info: "fast internal menu for already-paid orders: confirm only after payment and the ticket is released immediately",
    loading: "Loading internal menu…",
    loadError: "Could not load tables or menu.",
    tableLabel: "Table",
    tablePlaceholder: "Choose table",
    paymentLabel: "Payment",
    paymentLocationLabel: "Counter / table",
    payAtCounter: "Counter",
    payAtTable: "Table",
    payAtCounterHelp: "payment has already been completed at the counter",
    payAtTableHelp: "payment has already been completed at the table",
    methodLabel: "Payment method",
    card: "Card",
    cash: "Cash",
    search: "Search",
    products: "Products",
    noProducts: "No products match the current filters.",
    emptyDraft: "Add products to create an order.",
    draftTitle: "Order summary",
    confirm: "Confirm paid order",
    creating: "Creating…",
    created: (orderNumber) => `Paid order created: #${orderNumber}`,
    selectTableError: "Choose a table before confirming.",
    selectPaymentFlowError: "Choose where payment was collected.",
    selectPaymentMethodError: "Choose the payment method.",
    addItemsError: "Add at least one item to the order.",
    submitError: "Could not create the order.",
    productInfo:
      "use the +/- buttons on the right for instant add; open details only if you need photos, options or notes",
    quantityLabel: "items",
    totalLabel: "Estimated total",
    serviceLabel: "Service",
    searchPlaceholder: "Search item",
    stepHelp: "confirm only after collecting payment: the order is released immediately with no duplicate payment steps",
    detailsLabel: "Details",
    configureLabel: "Configure",
    buffered: "Order saved in the device buffer. It will be sent as soon as the network and database are available again.",
    syncing: (count) =>
      count === 1
        ? "1 buffered action"
        : `${count} buffered actions`,
  },
};

function cloneProductForLanguage(
  product: MenuProduct,
  language: StaffUiLanguage
): MenuProduct {
  return {
    ...product,
    name: getLocalizedMenuItemName({
      baseName: product.name,
      translations: product.nameTranslations,
      language,
    }),
  };
}

function areSameLine(a: CartLine, b: Omit<CartLine, "id" | "quantity">) {
  return (
    a.productId === b.productId &&
    a.name === b.name &&
    a.notes === b.notes &&
    JSON.stringify(a.selectedOptions) === JSON.stringify(b.selectedOptions) &&
    JSON.stringify(a.selectedNotes) === JSON.stringify(b.selectedNotes)
  );
}

function isQuickAddLine(line: CartLine) {
  return (
    line.selectedOptions.length === 0 &&
    line.selectedNotes.length === 0 &&
    (line.notes == null || line.notes.trim().length === 0)
  );
}

export function StaffOrderTakingPanel({
  restaurantName,
  restaurantSlug,
  language,
  onCreated,
  onBufferOrder,
  temporaryMode = false,
  pendingBufferedActions = 0,
  initialTables = [],
  initialCategories = [],
  initialCurrency = "EUR",
  initialServiceFeePercent = 0,
  initialDataLoaded = false,
}: {
  restaurantName: string;
  restaurantSlug: string;
  language: StaffUiLanguage;
  onCreated?: () => void | Promise<void>;
  onBufferOrder?: (payload: {
    tableId: string;
    language: StaffBufferedUiLanguage;
    paymentLocation: StaffBufferedPaymentLocation;
    paymentMethod: StaffBufferedPaymentMethod;
    items: StaffBufferedCreateOrderItem[];
  }) => Promise<boolean> | boolean;
  temporaryMode?: boolean;
  pendingBufferedActions?: number;
  initialTables?: StaffTable[];
  initialCategories?: MenuCategory[];
  initialCurrency?: string;
  initialServiceFeePercent?: number;
  initialDataLoaded?: boolean;
}) {
  const copy = PANEL_COPY[language];
  const customerCopy = getCustomerUiCopy(language);
  const panelStorageKey = useMemo(
    () =>
      `bb_staff_new_order_panel_${createRestaurantIdentityKey({
        name: restaurantName,
        slug: restaurantSlug,
      })}`,
    [restaurantName, restaurantSlug]
  );
  const orderTakingCircuitKey = useMemo(
    () =>
      getRuntimeCircuitKey({
        scope: "staff-order-taking",
        restaurantName,
        restaurantSlug,
      }),
    [restaurantName, restaurantSlug]
  );
  const orderTakingMetricsScope = useMemo(
    () => ({
      scope: "staff-order-taking" as const,
      restaurantName,
      restaurantSlug,
    }),
    [restaurantName, restaurantSlug]
  );
  const orderTakingSubmitMetricsScope = useMemo(
    () => ({
      scope: "staff-order-taking-submit" as const,
      restaurantName,
      restaurantSlug,
    }),
    [restaurantName, restaurantSlug]
  );
  const [tables, setTables] = useState<StaffTable[]>(initialTables);
  const [categories, setCategories] = useState<MenuCategory[]>(initialCategories);
  const [currency, setCurrency] = useState(initialCurrency);
  const [serviceFeePercent, setServiceFeePercent] = useState(
    initialServiceFeePercent
  );
  const [loading, setLoading] = useState(!initialDataLoaded);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(
    initialCategories[0]?.id ?? null
  );
  const [selectedTableId, setSelectedTableId] = useState(
    initialTables.length === 1 ? initialTables[0]?.id ?? "" : ""
  );
  const [paymentLocation, setPaymentLocation] =
    useState<PaymentLocation | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [draftLines, setDraftLines] = useState<CartLine[]>([]);
  const [sheetProduct, setSheetProduct] = useState<MenuProduct | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [panelOpen, setPanelOpen] = useState(DEFAULT_PANEL_OPEN);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(panelStorageKey);
    if (stored === "0") {
      setPanelOpen(false);
      return;
    }
    if (stored === "1") {
      setPanelOpen(true);
    }
  }, [panelStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(panelStorageKey, panelOpen ? "1" : "0");
  }, [panelOpen, panelStorageKey]);

  useEffect(() => {
    let cancelled = false;

    async function load(options?: { silent?: boolean }) {
      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
      }
      setLoadError(null);

      try {
        const circuit = getRuntimeCircuitMode(orderTakingCircuitKey);
        if (!circuit.canRequest) {
          setLoadError(copy.loadError);
          return;
        }

        const result = await fetchJsonWithRetry<{
          tables?: StaffTable[];
          categories?: MenuCategory[];
          currency?: string;
          serviceFeePercent?: number;
          error?: string;
        }>("/api/staff/order-taking", undefined, { attempts: 3 });

        if (!result.ok) {
          const nextCircuit = recordRuntimeCircuitFailure(orderTakingCircuitKey);
          recordRuntimeMetric(orderTakingMetricsScope, {
            type: "failure",
            failureClass: result.failureClass,
            retries: Math.max(0, result.attempts - 1),
          });
          if (nextCircuit.state === "open") {
            recordRuntimeMetric(orderTakingMetricsScope, { type: "breaker_open" });
          }
          throw new Error(result.errorMessage ?? result.data?.error ?? copy.loadError);
        }

        if (cancelled) return;

        recordRuntimeCircuitSuccess(orderTakingCircuitKey);
        recordRuntimeMetric(orderTakingMetricsScope, {
          type: "success",
          retries: Math.max(0, result.attempts - 1),
        });

        setTables(result.data?.tables ?? []);
        setCategories(result.data?.categories ?? []);
        setCurrency((result.data?.currency ?? "eur").toUpperCase());
        setServiceFeePercent(Number(result.data?.serviceFeePercent ?? 0));
        if ((result.data?.tables ?? []).length === 1) {
          setSelectedTableId(result.data?.tables?.[0]?.id ?? "");
        }
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : copy.loadError);
      } finally {
        if (!cancelled && !silent) {
          setLoading(false);
        }
      }
    }

    if (initialDataLoaded) {
      setLoading(false);
      void load({ silent: true });
    } else {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [copy.loadError, initialDataLoaded, orderTakingCircuitKey, orderTakingMetricsScope]);

  const localizedCategories = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        products: category.products.map((product) =>
          cloneProductForLanguage(product, language)
        ),
      })),
    [categories, language]
  );

  useEffect(() => {
    if (localizedCategories.length === 0) {
      setActiveCategory(null);
      return;
    }

    setActiveCategory((current) =>
      current != null && localizedCategories.some((category) => category.id === current)
        ? current
        : localizedCategories[0]?.id ?? null
    );
  }, [localizedCategories]);

  const visibleProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const allProducts = localizedCategories.flatMap((category) =>
      category.products.map((product) => ({
        ...product,
        categoryId: category.id,
      }))
    );

    return allProducts.filter((product) => {
      const matchesCategory =
        normalizedSearch.length > 0 ||
        activeCategory == null ||
        product.categoryId === activeCategory;
      const matchesSearch =
        normalizedSearch.length === 0
          ? true
          : product.name.toLowerCase().includes(normalizedSearch) ||
            product.description.toLowerCase().includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, localizedCategories, search]);

  const subtotal = useMemo(() => cartSubtotal(draftLines), [draftLines]);
  const serviceFee = useMemo(
    () => Math.round((subtotal * serviceFeePercent) / 100),
    [serviceFeePercent, subtotal]
  );
  const estimatedTotal = subtotal + serviceFee;
  const draftItemCount = useMemo(
    () => draftLines.reduce((sum, line) => sum + line.quantity, 0),
    [draftLines]
  );
  function productNeedsConfiguration(product: MenuProduct) {
    return product.optionGroups.some((group) => group.required);
  }

  function canOpenProductSheet(product: MenuProduct) {
    return (
      Boolean(product.imageUrl) ||
      product.optionGroups.length > 0 ||
      product.customerNotes.length > 0 ||
      product.description.trim().length > 0
    );
  }

  function getProductDraftQuantity(productId: string) {
    return draftLines
      .filter((line) => line.productId === productId)
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  function getQuickDraftQuantity(productId: string) {
    return draftLines
      .filter((line) => line.productId === productId && isQuickAddLine(line))
      .reduce((sum, line) => sum + line.quantity, 0);
  }

  function updateLineQuantity(lineId: string, quantity: number) {
    setDraftLines((current) =>
      current.flatMap((line) => {
        if (line.id !== lineId) return [line];
        if (quantity <= 0) return [];
        return [{ ...line, quantity }];
      })
    );
  }

  function updateQuickProductQuantity(product: MenuProduct, quantity: number) {
    setDraftLines((current) => {
      const existing = current.find(
        (line) => line.productId === product.id && isQuickAddLine(line)
      );

      if (existing) {
        if (quantity <= 0) {
          return current.filter((line) => line.id !== existing.id);
        }

        return current.map((line) =>
          line.id === existing.id ? { ...line, quantity } : line
        );
      }

      if (quantity <= 0) {
        return current;
      }

      return [
        ...current,
        {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${product.id}-${Date.now()}`,
          productId: product.id,
          name: product.name,
          imageUrl: product.imageUrl,
          unitPriceCents: product.price,
          quantity,
          selectedOptions: [],
          selectedNotes: [],
          notes: null,
        },
      ];
    });
    setSubmitError(null);
    setSuccessMessage(null);
  }

  function addConfiguredProduct(
    product: MenuProduct,
    args: {
      quantity: number;
      selectedNotes: CartLine["selectedNotes"];
      notes: string | null;
      selectedOptions: CartLine["selectedOptions"];
    }
  ) {
    setDraftLines((current) => {
      const nextLine = {
        productId: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        unitPriceCents: product.price,
        quantity: args.quantity,
        selectedOptions: args.selectedOptions,
        selectedNotes: args.selectedNotes,
        notes: args.notes,
      };
      const existing = current.find((line) => areSameLine(line, nextLine));

      if (existing) {
        return current.map((line) =>
          line.id === existing.id
            ? { ...line, quantity: line.quantity + args.quantity }
            : line
        );
      }

      return [
        ...current,
        {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${product.id}-${Date.now()}`,
          ...nextLine,
        },
      ];
    });
    setSheetProduct(null);
  }

  function resetDraftAfterSubmit() {
    setDraftLines([]);
    setPaymentLocation(null);
    setPaymentMethod(null);
    setPanelOpen(false);
  }

  async function refreshOrderTakingSnapshot() {
    try {
      const result = await fetchJsonWithRetry<{
        tables?: StaffTable[];
        categories?: MenuCategory[];
        currency?: string;
        serviceFeePercent?: number;
      }>("/api/staff/order-taking", undefined, { attempts: 2 });

      if (!result.ok || !result.data) return;

      setTables(result.data.tables ?? []);
      setCategories(result.data.categories ?? []);
      setCurrency((result.data.currency ?? "eur").toUpperCase());
      setServiceFeePercent(Number(result.data.serviceFeePercent ?? 0));
      if ((result.data.tables ?? []).length === 1) {
        setSelectedTableId(result.data.tables?.[0]?.id ?? "");
      }
    } catch {
      /* keep the existing snapshot if refresh fails */
    }
  }

  async function submitOrder() {
    setSubmitError(null);
    setSuccessMessage(null);

    if (!selectedTableId) {
      setSubmitError(copy.selectTableError);
      return;
    }

    if (!paymentLocation) {
      setSubmitError(copy.selectPaymentFlowError);
      return;
    }

    if (!paymentMethod) {
      setSubmitError(copy.selectPaymentMethodError);
      return;
    }

    if (draftLines.length === 0) {
      setSubmitError(copy.addItemsError);
      return;
    }

    const bufferedPayload = {
      tableId: selectedTableId,
      language,
      paymentLocation,
      paymentMethod,
      items: draftLines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        selectedNotes: line.selectedNotes,
        selectedOptions: line.selectedOptions,
        notes: line.notes,
      })),
    } satisfies Parameters<NonNullable<typeof onBufferOrder>>[0];

    if (temporaryMode && onBufferOrder) {
      const queued = await onBufferOrder(bufferedPayload);
      if (queued) {
        resetDraftAfterSubmit();
        setSuccessMessage(copy.buffered);
      }
      return;
    }

    setSubmitting(true);

    try {
      const result = await fetchJsonWithRetry<{
        orderNumber?: string;
        error?: string;
      }>(
        "/api/staff/orders",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bufferedPayload),
        },
        { attempts: 2 }
      );

      if (!result.ok) {
        recordRuntimeMetric(orderTakingSubmitMetricsScope, {
          type: "failure",
          failureClass: result.failureClass,
          retries: Math.max(0, result.attempts - 1),
        });
        if (result.status >= 500 && onBufferOrder) {
          const queued = await onBufferOrder(bufferedPayload);
          if (queued) {
            resetDraftAfterSubmit();
            setSuccessMessage(copy.buffered);
            return;
          }
        }
        setSubmitError(result.errorMessage ?? result.data?.error ?? copy.submitError);
        void refreshOrderTakingSnapshot();
        return;
      }

      recordRuntimeMetric(orderTakingSubmitMetricsScope, {
        type: "success",
        retries: Math.max(0, result.attempts - 1),
      });
      resetDraftAfterSubmit();
      setSuccessMessage(copy.created(result.data?.orderNumber ?? ""));
      await refreshOrderTakingSnapshot();
      await onCreated?.();
    } catch {
      setSubmitError(copy.submitError);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="mt-5 rounded-xl border border-hairline bg-white p-4 shadow-sm">
        <p className="text-sm text-muted">{copy.loading}</p>
      </section>
    );
  }

  return (
    <section className="mt-5 rounded-xl border border-hairline bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{copy.title}</h2>
        <button
          type="button"
          onClick={() => setPanelOpen((current) => !current)}
          className="rounded-full border border-hairline bg-canvas px-3 py-1.5 text-xs font-medium text-ink"
        >
          {panelOpen ? copy.closePanel : copy.openPanel}
        </button>
      </div>

      {loadError ? (
        <p className="mt-4 rounded-md bg-canvas px-3 py-3 text-sm text-bordeaux">
          {loadError}
        </p>
      ) : null}
      {temporaryMode || pendingBufferedActions > 0 ? (
        <p className="mt-3 rounded-md border border-bordeaux/15 bg-white px-3 py-2 text-xs text-bordeaux">
          {copy.syncing(pendingBufferedActions > 0 ? pendingBufferedActions : 1)}
        </p>
      ) : null}

      {!panelOpen ? (
        <div className="mt-4 rounded-md bg-canvas px-3 py-3 text-sm text-muted">
          {draftLines.length > 0
            ? `${draftItemCount} ${copy.quantityLabel} · ${formatCents(
                estimatedTotal,
                currency
              )}`
            : copy.emptyDraft}
        </div>
      ) : null}

      {panelOpen ? (
        <>
          <div className="mt-4 rounded-[1.35rem] border border-hairline bg-canvas p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  {copy.tableLabel}
                </span>
                <select
                  value={selectedTableId}
                  onChange={(event) => setSelectedTableId(event.target.value)}
                  className="w-full rounded-md border border-hairline bg-white px-3 py-2.5 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2"
                >
                  <option value="">{copy.tablePlaceholder}</option>
                  {tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {copy.tableLabel} {table.tableNumber}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink">
                  {copy.paymentLocationLabel}
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentLocation("cashier");
                      setSubmitError(null);
                    }}
                    className={
                      paymentLocation === "cashier"
                        ? "rounded-xl border border-bordeaux bg-[#f9f0ec] px-3 py-3 text-left shadow-sm"
                        : "rounded-xl border border-hairline bg-white px-3 py-3 text-left"
                    }
                  >
                    <p className="text-sm font-semibold text-ink">{copy.payAtCounter}</p>
                    <p className="mt-1 text-xs text-muted">{copy.payAtCounterHelp}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentLocation("table");
                      setSubmitError(null);
                    }}
                    className={
                      paymentLocation === "table"
                        ? "rounded-xl border border-bordeaux bg-[#f9f0ec] px-3 py-3 text-left shadow-sm"
                        : "rounded-xl border border-hairline bg-white px-3 py-3 text-left"
                    }
                  >
                    <p className="text-sm font-semibold text-ink">{copy.payAtTable}</p>
                    <p className="mt-1 text-xs text-muted">{copy.payAtTableHelp}</p>
                  </button>
                </div>

                <div className="mt-3">
                  <span className="mb-1.5 block text-sm font-medium text-ink">
                    {copy.methodLabel}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: "card", label: copy.card },
                      { id: "cash", label: copy.cash },
                    ] as const).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(option.id);
                          setSubmitError(null);
                        }}
                        className={
                          paymentMethod === option.id
                            ? "rounded-full bg-bordeaux px-4 py-2 text-sm font-medium text-white"
                            : "rounded-full border border-hairline bg-white px-4 py-2 text-sm font-medium text-ink"
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)]">
            <div className="min-w-0 rounded-[1.35rem] border border-hairline bg-canvas p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-ink">{copy.products}</h3>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  className="w-full rounded-md border border-hairline bg-white px-3 py-2 text-sm text-ink outline-none ring-bordeaux/20 focus:ring-2 sm:max-w-xs"
                />
              </div>

              <div className="mt-3">
                <CategoryTabs
                  categories={localizedCategories}
                  activeId={activeCategory}
                  onSelect={setActiveCategory}
                />
              </div>

              <div className="mt-4 space-y-2">
                {visibleProducts.length === 0 ? (
                  <p className="rounded-md bg-white px-3 py-3 text-sm text-muted">
                    {copy.noProducts}
                  </p>
                ) : (
                  visibleProducts.map((product) => {
                    const totalQuantity = getProductDraftQuantity(product.id);
                    const quickQuantity = getQuickDraftQuantity(product.id);
                    const requiresConfiguration = productNeedsConfiguration(product);
                    const showDetails = canOpenProductSheet(product);

                    return (
                      <article
                        key={product.id}
                        className="rounded-lg border border-hairline bg-white px-3 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          {showDetails ? (
                            <button
                              type="button"
                              onClick={() => setSheetProduct(product)}
                              className="shrink-0 rounded-md border border-hairline bg-canvas transition hover:border-bordeaux/25"
                              aria-label={`${copy.detailsLabel}: ${product.name}`}
                            >
                              {product.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="h-11 w-11 rounded-md object-cover"
                                />
                              ) : (
                                <div className="h-11 w-11 rounded-md border border-hairline bg-canvas" />
                              )}
                            </button>
                          ) : product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-11 w-11 rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-11 w-11 rounded-md border border-hairline bg-canvas" />
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm font-semibold text-ink">
                                {product.name}
                              </p>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                                {formatCents(product.price, currency)}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-muted">
                              {product.volumeLabel || product.description || "—"}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {showDetails ? (
                                <button
                                  type="button"
                                  onClick={() => setSheetProduct(product)}
                                  className="rounded-full border border-hairline bg-canvas px-2.5 py-1 text-[11px] font-medium text-bordeaux transition hover:border-bordeaux/25"
                                >
                                  {requiresConfiguration
                                    ? copy.configureLabel
                                    : copy.detailsLabel}
                                </button>
                              ) : null}
                              {totalQuantity > 0 &&
                              (!requiresConfiguration || totalQuantity !== quickQuantity) ? (
                                <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                                  {totalQuantity} {copy.quantityLabel}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="shrink-0">
                            {requiresConfiguration ? (
                              <button
                                type="button"
                                onClick={() => setSheetProduct(product)}
                                className="rounded-full bg-bordeaux px-3 py-2 text-xs font-semibold text-white"
                              >
                                {copy.configureLabel}
                              </button>
                            ) : (
                              <div className="flex items-center gap-1 rounded-full border border-hairline bg-canvas px-1 py-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQuickProductQuantity(
                                      product,
                                      Math.max(0, quickQuantity - 1)
                                    )
                                  }
                                  aria-label={`${customerCopy.decreaseQuantity}: ${product.name}`}
                                  disabled={quickQuantity === 0}
                                  className="flex h-9 w-9 items-center justify-center rounded-full text-base text-ink disabled:opacity-35"
                                >
                                  −
                                </button>
                                <span className="min-w-[2ch] text-center text-sm font-semibold text-ink">
                                  {quickQuantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQuickProductQuantity(
                                      product,
                                      quickQuantity + 1
                                    )
                                  }
                                  aria-label={`${customerCopy.increaseQuantity}: ${product.name}`}
                                  className="flex h-9 w-9 items-center justify-center rounded-full bg-bordeaux text-base text-white"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-hairline bg-canvas p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-ink">{copy.draftTitle}</h3>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-muted">
                  {draftItemCount} {copy.quantityLabel}
                </span>
              </div>

              <div className="mt-3 space-y-2.5">
                {draftLines.length === 0 ? (
                  <p className="rounded-md bg-white px-3 py-3 text-sm text-muted">
                    {copy.emptyDraft}
                  </p>
                ) : (
                  draftLines.map((line) => (
                    <article
                      key={line.id}
                      className="rounded-md border border-hairline bg-white px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink">
                            {line.quantity}× {line.name}
                          </p>
                          {line.selectedOptions.length > 0 ? (
                            <p className="mt-1 text-xs text-muted">
                              {line.selectedOptions
                                .flatMap((group) => group.labels)
                                .join(", ")}
                            </p>
                          ) : null}
                          {line.selectedNotes.length > 0 ? (
                            <p className="mt-1 text-xs text-muted">
                              {formatProductCustomerNoteSelections(line.selectedNotes)}
                            </p>
                          ) : null}
                          {line.notes ? (
                            <p className="mt-1 text-xs text-muted">{line.notes}</p>
                          ) : null}
                        </div>
                        <p className="text-sm font-semibold tabular-nums text-ink">
                          {formatCents(lineSubtotal(line), currency)}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateLineQuantity(line.id, line.quantity - 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-canvas text-base text-ink"
                        >
                          −
                        </button>
                        <span className="min-w-[2ch] text-center text-sm font-medium text-ink">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateLineQuantity(line.id, line.quantity + 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-canvas text-base text-ink"
                        >
                          +
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="mt-4 rounded-md bg-white px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-3 text-muted">
                  <span>{copy.serviceLabel}</span>
                  <span>{serviceFeePercent.toFixed(2)}%</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 font-semibold text-ink">
                  <span>{copy.totalLabel}</span>
                  <span className="tabular-nums">
                    {formatCents(estimatedTotal, currency)}
                  </span>
                </div>
              </div>

              {submitError ? (
                <p className="mt-3 text-sm text-bordeaux">{submitError}</p>
              ) : null}
              {successMessage ? (
                <p className="mt-3 text-sm text-emerald-700">{successMessage}</p>
              ) : null}

              <button
                type="button"
                onClick={() => void submitOrder()}
                disabled={submitting}
                className="mt-4 min-h-11 w-full rounded-md bg-bordeaux px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {submitting ? copy.creating : copy.confirm}
              </button>
            </div>
          </div>

          {sheetProduct ? (
            <ProductSheet
              product={sheetProduct}
              currency={currency}
              copy={customerCopy}
              onClose={() => setSheetProduct(null)}
              onAdd={(args) => addConfiguredProduct(sheetProduct, args)}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
