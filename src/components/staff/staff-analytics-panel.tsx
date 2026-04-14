"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJsonWithRetry } from "@/lib/runtime-resilience";
import type {
  AnalyticsPaymentMethodPoint,
  AnalyticsPoint,
  AnalyticsRangeDays,
  AnalyticsRankingPoint,
  AnalyticsStatusPoint,
  StaffAnalyticsPayload,
} from "@/types/staff-analytics";

type StaffUiLanguage = "it" | "en";

const RANGE_OPTIONS: AnalyticsRangeDays[] = [7, 14, 30];
const DONUT_COLORS = ["#6E0F1F", "#A53B4B", "#C87B85", "#D9A8AF", "#EAD2D6"];
const STATUS_COLORS: Record<string, string> = {
  new: "#C87B85",
  preparing: "#8B1F2F",
  ready: "#6E0F1F",
  served: "#D9A8AF",
};

const ANALYTICS_COPY = {
  it: {
    analytics: "Analisi",
    loading: "Caricamento analisi…",
    loadError: "Impossibile caricare le analisi.",
    subtitle:
      "Vista operativa e business del locale con andamento, mix prodotti e richieste tavolo.",
    days: "giorni",
    sales: "Vendite",
    salesHint: "Incasso totale del periodo selezionato.",
    orders: "Ordini",
    ordersHint: "Numero totale di ordini confermati.",
    averageTicket: "Scontrino medio",
    averageTicketHint: "Incasso medio per ordine.",
    averagePrep: "Tempo medio prep",
    averagePrepHint: "Media tra start preparing e ready.",
    rewardsIssued: "Reward emessi",
    rewardsIssuedHint: "Premi realmente assegnati dalla ruota.",
    rewardsRedeemed: "Reward riscattati",
    rewardsRedeemedHint: "di redemption.",
    tableRequests: "Richieste tavolo",
    tableRequestsHint: "Totale chiamate e richieste pagamento al tavolo.",
    generated: "Generato",
    generatedHint: "Analisi aggiornata sugli ultimi {days} giorni.",
    salesByDay: "Vendite per giorno",
    salesByDayHint: "Capisci subito giorni forti, giorni deboli e trend settimanale.",
    salesByHour: "Vendite per ora",
    salesByHourHint: "Visuale oraria per individuare i picchi di pranzo, aperitivo e sera.",
    heatmap: "Heatmap giorno × ora",
    heatmapHint:
      "Intensita piu alta = piu ordini. Ideale per leggere subito i momenti di affluenza.",
    ordersByDay: "Numero ordini per giorno",
    ordersByDayHint: "Non solo euro: quanti ordini hai davvero ogni giorno.",
    averageTicketTrend: "Scontrino medio",
    averageTicketTrendHint:
      "Misura se nel tempo il valore medio per ordine sta crescendo o scendendo.",
    topProductsByQuantity: "Prodotti piu venduti",
    topProductsByQuantityHint: "Best seller del periodo per quantita venduta.",
    topProductsByRevenue: "Prodotti per incasso",
    topProductsByRevenueHint: "I prodotti che generano piu ricavi nel periodo.",
    salesByCategory: "Vendite per categoria",
    salesByCategoryHint: "Leggi subito da quali categorie arriva il fatturato.",
    paymentMethods: "Metodi di pagamento",
    paymentMethodsHint: "Ripartizione tra online, cassa e pagamenti al tavolo.",
    orderStatusTimeline: "Stato ordini nel tempo",
    orderStatusTimelineHint:
      "Barre giornaliere con la distribuzione dei vari stati operativi.",
    prepTime: "Tempo medio di preparazione",
    prepTimeHint: "Minuti medi tra inizio preparazione e ordine pronto.",
    rewardPerformance: "Performance reward",
    rewardPerformanceHint:
      "Misura quanto la ruota porta davvero redemption e quali premi funzionano meglio.",
    waiterRequests: "Chiamate cameriere e richieste tavolo",
    waiterRequestsHint:
      "Leggi trend giornaliero, picchi orari e tavoli con piu richieste.",
    topTables: "Tavoli con piu richieste",
    noData: "Nessun dato nel periodo selezionato.",
    noRequests: "Nessuna richiesta nel periodo selezionato.",
    total: "Totale",
    ordersLower: "ordini",
    table: "Tavolo",
    requestsLower: "richieste",
    issuedLower: "emessi",
    issuedTitle: "Reward emessi",
    redeemedTitle: "Reward riscattati",
    redemptionRate: "Tasso di riscatto",
    pieces: "pezzi",
    notAvailable: "n.d.",
    min: "min",
    statusNew: "Nuovi",
    statusPreparing: "In preparazione",
    statusReady: "Pronti",
    statusServed: "Serviti",
    paymentOnline: "Carta / wallet online",
    paymentCounterCard: "Carta in cassa",
    paymentCounterCash: "Contanti in cassa",
    paymentTableCard: "Carta al tavolo",
    paymentTableCash: "Contanti al tavolo",
    paymentTable: "Pagamento al tavolo",
    paymentCounter: "Pagamento in cassa",
    paymentOther: "Altro",
    rewardCocktail: "Cocktail gratis",
    rewardCocktailAperitivo: "Cocktail + aperitivo",
    weekdayMon: "Lun",
    weekdayTue: "Mar",
    weekdayWed: "Mer",
    weekdayThu: "Gio",
    weekdayFri: "Ven",
    weekdaySat: "Sab",
    weekdaySun: "Dom",
    heatmapTitle: "{day} {hour}:00 · {value} ordini",
  },
  en: {
    analytics: "Analytics",
    loading: "Loading analytics…",
    loadError: "Could not load analytics.",
    subtitle:
      "Operational and business view for the venue with trends, product mix, and table requests.",
    days: "days",
    sales: "Sales",
    salesHint: "Total revenue for the selected period.",
    orders: "Orders",
    ordersHint: "Total confirmed orders.",
    averageTicket: "Average ticket",
    averageTicketHint: "Average revenue per order.",
    averagePrep: "Avg prep time",
    averagePrepHint: "Average time between start preparing and ready.",
    rewardsIssued: "Rewards issued",
    rewardsIssuedHint: "Rewards actually assigned by the wheel.",
    rewardsRedeemed: "Rewards redeemed",
    rewardsRedeemedHint: "redemption rate.",
    tableRequests: "Table requests",
    tableRequestsHint: "Total waiter calls and table payment requests.",
    generated: "Generated",
    generatedHint: "Analytics updated over the last {days} days.",
    salesByDay: "Sales by day",
    salesByDayHint: "Spot strong days, weak days, and weekly trend at a glance.",
    salesByHour: "Sales by hour",
    salesByHourHint: "Hourly view to spot lunch, aperitivo, and evening peaks.",
    heatmap: "Day × hour heatmap",
    heatmapHint: "Higher intensity means more orders. Useful to spot busy moments fast.",
    ordersByDay: "Orders by day",
    ordersByDayHint: "Not only revenue: how many orders you actually handled each day.",
    averageTicketTrend: "Average ticket",
    averageTicketTrendHint:
      "Track whether the average order value is growing or declining over time.",
    topProductsByQuantity: "Top products by quantity",
    topProductsByQuantityHint: "Best sellers in the selected period by units sold.",
    topProductsByRevenue: "Top products by revenue",
    topProductsByRevenueHint: "Products generating the most revenue in the period.",
    salesByCategory: "Sales by category",
    salesByCategoryHint: "See immediately which categories drive revenue.",
    paymentMethods: "Payment methods",
    paymentMethodsHint: "Split between online, counter, and table payments.",
    orderStatusTimeline: "Order status over time",
    orderStatusTimelineHint:
      "Daily bars showing the distribution of operational order states.",
    prepTime: "Average preparation time",
    prepTimeHint: "Average minutes between preparation start and ready state.",
    rewardPerformance: "Reward performance",
    rewardPerformanceHint:
      "Measure how much the wheel really drives redemption and which rewards work best.",
    waiterRequests: "Waiter calls and table requests",
    waiterRequestsHint:
      "Read daily trend, hourly peaks, and tables with the highest request volume.",
    topTables: "Tables with most requests",
    noData: "No data in the selected period.",
    noRequests: "No requests in the selected period.",
    total: "Total",
    ordersLower: "orders",
    table: "Table",
    requestsLower: "requests",
    issuedLower: "issued",
    issuedTitle: "Rewards issued",
    redeemedTitle: "Rewards redeemed",
    redemptionRate: "Redemption rate",
    pieces: "items",
    notAvailable: "n/a",
    min: "min",
    statusNew: "New",
    statusPreparing: "Preparing",
    statusReady: "Ready",
    statusServed: "Served",
    paymentOnline: "Card / online wallet",
    paymentCounterCard: "Card at counter",
    paymentCounterCash: "Cash at counter",
    paymentTableCard: "Card at table",
    paymentTableCash: "Cash at table",
    paymentTable: "Table payment",
    paymentCounter: "Counter payment",
    paymentOther: "Other",
    rewardCocktail: "Free cocktail",
    rewardCocktailAperitivo: "Cocktail + aperitivo",
    weekdayMon: "Mon",
    weekdayTue: "Tue",
    weekdayWed: "Wed",
    weekdayThu: "Thu",
    weekdayFri: "Fri",
    weekdaySat: "Sat",
    weekdaySun: "Sun",
    heatmapTitle: "{day} {hour}:00 · {value} orders",
  },
} as const;

function KpiCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{value}</p>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function VerticalBarChart({
  data,
  formatValue,
}: {
  data: AnalyticsPoint[];
  formatValue: (value: number) => string;
}) {
  const maxValue = Math.max(1, ...data.map((item) => item.value));

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-end gap-3 pb-2">
        {data.map((item) => (
          <div key={item.key} className="flex w-12 flex-col items-center gap-2">
            <span className="text-[11px] font-medium text-muted">
              {item.value > 0 ? formatValue(item.value) : "0"}
            </span>
            <div className="flex h-40 w-full items-end rounded-full bg-canvas px-1 py-1">
              <div
                className="w-full rounded-full bg-bordeaux"
                style={{
                  height:
                    item.value === 0
                      ? "0%"
                      : `${Math.max(6, (item.value / maxValue) * 100)}%`,
                }}
                title={`${item.label}: ${formatValue(item.value)}`}
              />
            </div>
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({
  data,
  formatValue,
}: {
  data: AnalyticsPoint[];
  formatValue: (value: number) => string;
}) {
  const width = Math.max(520, data.length * 34);
  const height = 220;
  const maxValue = Math.max(1, ...data.map((item) => item.value));
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data
    .map((item, index) => {
      const x = index * stepX;
      const y = height - (item.value / maxValue) * (height - 24) - 12;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-56 w-full overflow-visible rounded-xl bg-canvas p-3"
          role="img"
        >
          {[0, 1, 2, 3].map((step) => {
            const y = 16 + ((height - 32) / 3) * step;
            return (
              <line
                key={step}
                x1="0"
                y1={y}
                x2={width}
                y2={y}
                stroke="#E7DFDD"
                strokeDasharray="4 6"
              />
            );
          })}
          <polyline
            fill="none"
            stroke="#6E0F1F"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />
          {data.map((item, index) => {
            const x = index * stepX;
            const y = height - (item.value / maxValue) * (height - 24) - 12;
            return (
              <g key={item.key}>
                <circle cx={x} cy={y} r="4" fill="#6E0F1F" />
                <text
                  x={x}
                  y={height - 2}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#756D6A"
                >
                  {item.label}
                </text>
                {item.value > 0 ? (
                  <text
                    x={x}
                    y={Math.max(14, y - 10)}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#4A1C23"
                  >
                    {formatValue(item.value)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function HorizontalBars({
  data,
  formatValue,
  emptyLabel,
}: {
  data: AnalyticsRankingPoint[];
  formatValue: (value: number) => string;
  emptyLabel: string;
}) {
  const maxValue = Math.max(1, ...data.map((item) => item.value));

  return (
    <div className="space-y-3">
      {data.length === 0 ? (
        <p className="rounded-lg bg-canvas px-4 py-6 text-sm text-muted">
          {emptyLabel}
        </p>
      ) : (
        data.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-ink">{item.label}</span>
              <span className="shrink-0 text-muted">{formatValue(item.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-canvas">
              <div
                className="h-2 rounded-full bg-bordeaux"
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DonutChart({
  data,
  totalLabel,
  ordersLabel,
  formatCurrency,
}: {
  data: AnalyticsPaymentMethodPoint[];
  totalLabel: string;
  ordersLabel: string;
  formatCurrency: (value: number) => string;
}) {
  const total = data.reduce((sum, item) => sum + item.sales, 0);
  let current = 0;
  const background =
    total > 0
      ? `conic-gradient(${data
          .map((item, index) => {
            const start = current;
            const span = (item.sales / total) * 360;
            current += span;
            return `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start}deg ${current}deg`;
          })
          .join(", ")})`
      : "conic-gradient(#E7DFDD 0deg 360deg)";

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="flex flex-col items-center justify-center">
        <div className="relative h-44 w-44 rounded-full" style={{ background }}>
          <div className="absolute inset-6 flex items-center justify-center rounded-full bg-white text-center">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted">
                {totalLabel}
              </p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {formatCurrency(total)}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {data.map((item, index) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-3 text-sm"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
              />
              <span className="font-medium text-ink">{item.label}</span>
            </div>
            <div className="text-right">
              <p className="font-medium text-ink">{formatCurrency(item.sales)}</p>
              <p className="text-xs text-muted">
                {item.orders} {ordersLabel}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({
  data,
  titleFormatter,
}: {
  data: StaffAnalyticsPayload["heatmap"];
  titleFormatter: (day: string, hour: string, value: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[920px]">
        <div className="mb-2 grid grid-cols-[90px_repeat(24,minmax(0,1fr))] gap-1 text-[11px] text-muted">
          <div />
          {data.hours.map((hour) => (
            <div key={hour} className="text-center">
              {hour}
            </div>
          ))}
        </div>
        <div className="space-y-1">
          {data.days.map((day, rowIndex) => (
            <div
              key={day}
              className="grid grid-cols-[90px_repeat(24,minmax(0,1fr))] gap-1"
            >
              <div className="flex items-center text-sm font-medium text-ink">
                {day}
              </div>
              {data.values[rowIndex].map((value, hourIndex) => {
                const intensity = value === 0 ? 0 : value / data.maxValue;
                const backgroundColor =
                  intensity === 0
                    ? "#F3F1F0"
                    : `rgba(110, 15, 31, ${0.14 + intensity * 0.82})`;
                return (
                  <div
                    key={`${day}-${hourIndex}`}
                    className="flex h-9 items-center justify-center rounded-md text-[11px] font-medium"
                    style={{
                      backgroundColor,
                      color: intensity > 0.55 ? "#FFFFFF" : "#4B4543",
                    }}
                    title={titleFormatter(day, data.hours[hourIndex], value)}
                  >
                    {value > 0 ? value : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusTimeline({
  data,
  getStatusLabel,
}: {
  data: AnalyticsStatusPoint[];
  getStatusLabel: (key: string) => string;
}) {
  const totals = data.map(
    (item) => item.new + item.preparing + item.ready + item.served
  );
  const maxTotal = Math.max(1, ...totals);

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-end gap-4">
        {data.map((item) => {
          const total = item.new + item.preparing + item.ready + item.served;
          const segments = [
            { key: "new", value: item.new },
            { key: "preparing", value: item.preparing },
            { key: "ready", value: item.ready },
            { key: "served", value: item.served },
          ];

          return (
            <div key={item.key} className="flex w-14 flex-col items-center gap-2">
              <span className="text-[11px] text-muted">{total}</span>
              <div className="flex h-40 w-full flex-col justify-end overflow-hidden rounded-lg bg-canvas p-1">
                <div
                  className="flex h-full flex-col justify-end rounded-md"
                  style={{
                    height:
                      total === 0
                        ? "0%"
                        : `${Math.max(8, (total / maxTotal) * 100)}%`,
                  }}
                >
                  {segments
                    .filter((segment) => segment.value > 0)
                    .map((segment) => (
                      <div
                        key={segment.key}
                        style={{
                          height: `${(segment.value / total) * 100}%`,
                          backgroundColor: STATUS_COLORS[segment.key],
                        }}
                        title={`${getStatusLabel(segment.key)}: ${segment.value}`}
                      />
                    ))}
                </div>
              </div>
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
        {Object.entries(STATUS_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span>{getStatusLabel(key)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RewardPerformance({
  data,
  issuedTitle,
  redeemedTitle,
  redemptionRateTitle,
  emptyLabel,
  formatIssuedValue,
}: {
  data: StaffAnalyticsPayload["rewardPerformance"];
  issuedTitle: string;
  redeemedTitle: string;
  redemptionRateTitle: string;
  emptyLabel: string;
  formatIssuedValue: (value: number) => string;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="rounded-lg bg-canvas px-4 py-4">
          <p className="text-xs uppercase tracking-[0.16em] text-muted">{issuedTitle}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{data.issued}</p>
        </div>
        <div className="rounded-lg bg-canvas px-4 py-4">
          <p className="text-xs uppercase tracking-[0.16em] text-muted">{redeemedTitle}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{data.redeemed}</p>
        </div>
        <div className="rounded-lg bg-canvas px-4 py-4">
          <p className="text-xs uppercase tracking-[0.16em] text-muted">
            {redemptionRateTitle}
          </p>
          <p className="mt-2 text-2xl font-semibold text-ink">
            {data.redemptionRate.toFixed(1)}%
          </p>
        </div>
      </div>
      <HorizontalBars
        data={data.byPrize.map((item) => ({
          label: `${item.label} · ${item.redeemed}/${item.issued}`,
          value: item.issued,
        }))}
        formatValue={formatIssuedValue}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}

export function StaffAnalyticsPanel({
  language,
  initialData = null,
  initialDataLoaded = false,
}: {
  language: StaffUiLanguage;
  initialData?: StaffAnalyticsPayload | null;
  initialDataLoaded?: boolean;
}) {
  const [rangeDays, setRangeDays] = useState<AnalyticsRangeDays>(
    initialData?.rangeDays ?? 14
  );
  const [loading, setLoading] = useState(!initialDataLoaded);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StaffAnalyticsPayload | null>(initialData);
  const hasHydratedDataRef = useRef(initialDataLoaded);

  const copy = ANALYTICS_COPY[language];
  const locale = language === "en" ? "en-US" : "it-IT";

  const formatCurrency = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
      }).format(value / 100),
    [locale]
  );

  const formatMinutes = useCallback(
    (value: number | null) => {
      if (value == null || value <= 0) return copy.notAvailable;
      return `${value.toFixed(1)} ${copy.min}`;
    },
    [copy.min, copy.notAvailable]
  );

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale]
  );

  const replaceToken = useCallback((template: string, key: string, value: string) => {
    return template.replace(`{${key}}`, value);
  }, []);

  const translateHeatmapDay = useCallback(
    (label: string) => {
      const map: Record<string, string> = {
        Lun: copy.weekdayMon,
        Mar: copy.weekdayTue,
        Mer: copy.weekdayWed,
        Gio: copy.weekdayThu,
        Ven: copy.weekdayFri,
        Sab: copy.weekdaySat,
        Dom: copy.weekdaySun,
      };
      return map[label] ?? label;
    },
    [
      copy.weekdayFri,
      copy.weekdayMon,
      copy.weekdaySat,
      copy.weekdaySun,
      copy.weekdayThu,
      copy.weekdayTue,
      copy.weekdayWed,
    ]
  );

  const translatePaymentLabel = useCallback(
    (label: string) => {
      const map: Record<string, string> = {
        "Carta / wallet online": copy.paymentOnline,
        "Carta in cassa": copy.paymentCounterCard,
        "Contanti in cassa": copy.paymentCounterCash,
        "Carta al tavolo": copy.paymentTableCard,
        "Contanti al tavolo": copy.paymentTableCash,
        "Pagamento al tavolo": copy.paymentTable,
        "Pagamento in cassa": copy.paymentCounter,
        Altro: copy.paymentOther,
      };
      return map[label] ?? label;
    },
    [
      copy.paymentCounter,
      copy.paymentCounterCard,
      copy.paymentCounterCash,
      copy.paymentOnline,
      copy.paymentOther,
      copy.paymentTable,
      copy.paymentTableCard,
      copy.paymentTableCash,
    ]
  );

  const translateRewardLabel = useCallback(
    (label: string) => {
      const map: Record<string, string> = {
        "Cocktail gratis": copy.rewardCocktail,
        "Cocktail + aperitivo": copy.rewardCocktailAperitivo,
      };
      return map[label] ?? label;
    },
    [copy.rewardCocktail, copy.rewardCocktailAperitivo]
  );

  const getStatusLabel = useCallback(
    (status: string) => {
      if (status === "new") return copy.statusNew;
      if (status === "preparing") return copy.statusPreparing;
      if (status === "ready") return copy.statusReady;
      if (status === "served") return copy.statusServed;
      return status;
    },
    [copy.statusNew, copy.statusPreparing, copy.statusReady, copy.statusServed]
  );

  const translatedHeatmap = useMemo(
    () =>
      data
        ? {
            ...data.heatmap,
            days: data.heatmap.days.map(translateHeatmapDay),
          }
        : null,
    [data, translateHeatmapDay]
  );

  const translatedPaymentMethods = useMemo(
    () =>
      (data?.paymentMethods ?? []).map((item) => ({
        ...item,
        label: translatePaymentLabel(item.label),
      })),
    [data?.paymentMethods, translatePaymentLabel]
  );

  const translatedRewardPerformance = useMemo(
    () =>
      data
        ? {
            ...data.rewardPerformance,
            byPrize: data.rewardPerformance.byPrize.map((item) => ({
              ...item,
              label: translateRewardLabel(item.label),
            })),
          }
        : null,
    [data, translateRewardLabel]
  );

  const load = useCallback(
    async (days: AnalyticsRangeDays, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await fetchJsonWithRetry<StaffAnalyticsPayload & { error?: string }>(
          `/api/staff/analytics?days=${days}`,
          undefined,
          { attempts: 3 }
        );
        if (!result.ok) {
          setError(result.errorMessage ?? result.data?.error ?? copy.loadError);
          setData(null);
          return;
        }

        setData(result.data as StaffAnalyticsPayload);
        hasHydratedDataRef.current = true;
      } catch {
        setError(copy.loadError);
        setData(null);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [copy.loadError]
  );

  useEffect(() => {
    if (initialDataLoaded) {
      setLoading(false);
      if ((initialData?.rangeDays ?? 14) === rangeDays) {
        return;
      }
    }
    void load(rangeDays, { silent: hasHydratedDataRef.current });
  }, [initialData?.rangeDays, initialDataLoaded, load, rangeDays]);

  const requestTopTables = useMemo(
    () => data?.requestPerformance.topTables ?? [],
    [data]
  );

  if (loading && !data) {
    return (
      <div className="mt-6 flex min-h-[18rem] items-center justify-center rounded-xl border border-hairline bg-white p-6 shadow-sm">
        <p className="text-sm text-muted">{copy.loading}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-hairline bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{copy.analytics}</h2>
          <div className="flex gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRangeDays(option)}
                className={
                  rangeDays === option
                    ? "rounded-full bg-bordeaux px-4 py-2 text-sm font-medium text-white"
                    : "rounded-full border border-hairline bg-canvas px-4 py-2 text-sm font-medium text-ink"
                }
              >
                {option} {copy.days}
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="mt-4 text-sm text-bordeaux">{error}</p> : null}
      </section>

      {data ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label={copy.sales} value={formatCurrency(data.kpis.totalSales)} />
            <KpiCard label={copy.orders} value={String(data.kpis.totalOrders)} />
            <KpiCard
              label={copy.averageTicket}
              value={formatCurrency(data.kpis.averageTicket)}
            />
            <KpiCard
              label={copy.averagePrep}
              value={formatMinutes(data.kpis.averagePrepMinutes)}
            />
            <KpiCard
              label={copy.rewardsIssued}
              value={String(data.kpis.rewardsIssued)}
            />
            <KpiCard
              label={copy.rewardsRedeemed}
              value={String(data.kpis.rewardsRedeemed)}
            />
            <KpiCard
              label={copy.tableRequests}
              value={String(data.kpis.totalRequests)}
            />
            <KpiCard
              label={copy.generated}
              value={timeFormatter.format(new Date(data.generatedAt))}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title={copy.salesByDay}>
              <VerticalBarChart
                data={data.salesByDay}
                formatValue={(value) => formatCurrency(value)}
              />
            </SectionCard>
            <SectionCard title={copy.salesByHour}>
              <LineChart
                data={data.salesByHour}
                formatValue={(value) => formatCurrency(value)}
              />
            </SectionCard>
          </div>

          <SectionCard title={copy.heatmap}>
            {translatedHeatmap ? (
              <Heatmap
                data={translatedHeatmap}
                titleFormatter={(day, hour, value) =>
                  replaceToken(
                    replaceToken(
                      replaceToken(copy.heatmapTitle, "day", day),
                      "hour",
                      hour
                    ),
                    "value",
                    String(value)
                  )
                }
              />
            ) : null}
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title={copy.ordersByDay}>
              <VerticalBarChart
                data={data.ordersByDay}
                formatValue={(value) => `${value}`}
              />
            </SectionCard>
            <SectionCard title={copy.averageTicketTrend}>
              <LineChart
                data={data.averageTicketByDay}
                formatValue={(value) => formatCurrency(value)}
              />
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title={copy.topProductsByQuantity}>
              <HorizontalBars
                data={data.topProductsByQuantity}
                formatValue={(value) => `${value} ${copy.pieces}`}
                emptyLabel={copy.noData}
              />
            </SectionCard>
            <SectionCard title={copy.topProductsByRevenue}>
              <HorizontalBars
                data={data.topProductsByRevenue}
                formatValue={(value) => formatCurrency(value)}
                emptyLabel={copy.noData}
              />
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title={copy.salesByCategory}>
              <HorizontalBars
                data={data.salesByCategory}
                formatValue={(value) => formatCurrency(value)}
                emptyLabel={copy.noData}
              />
            </SectionCard>
            <SectionCard title={copy.paymentMethods}>
              <DonutChart
                data={translatedPaymentMethods}
                totalLabel={copy.total}
                ordersLabel={copy.ordersLower}
                formatCurrency={formatCurrency}
              />
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title={copy.orderStatusTimeline}>
              <StatusTimeline
                data={data.orderStatusByDay}
                getStatusLabel={getStatusLabel}
              />
            </SectionCard>
            <SectionCard title={copy.prepTime}>
              <LineChart
                data={data.prepTimeByDay}
                formatValue={(value) => `${value.toFixed(1)}${copy.min}`}
              />
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title={copy.rewardPerformance}>
              {translatedRewardPerformance ? (
                <RewardPerformance
                  data={translatedRewardPerformance}
                  issuedTitle={copy.issuedTitle}
                  redeemedTitle={copy.redeemedTitle}
                  redemptionRateTitle={copy.redemptionRate}
                  emptyLabel={copy.noData}
                  formatIssuedValue={(value) => `${value} ${copy.issuedLower}`}
                />
              ) : null}
            </SectionCard>
            <SectionCard title={copy.waiterRequests}>
              <div className="grid gap-6">
                <LineChart
                  data={data.requestPerformance.requestsByDay}
                  formatValue={(value) => `${value}`}
                />
                <VerticalBarChart
                  data={data.requestPerformance.requestsByHour}
                  formatValue={(value) => `${value}`}
                />
                <div>
                  <p className="mb-3 text-sm font-medium text-ink">{copy.topTables}</p>
                  <div className="space-y-3">
                    {requestTopTables.length === 0 ? (
                      <p className="rounded-lg bg-canvas px-4 py-6 text-sm text-muted">
                        {copy.noRequests}
                      </p>
                    ) : (
                      requestTopTables.map((item) => (
                        <div
                          key={item.tableNumber}
                          className="flex items-center justify-between rounded-lg bg-canvas px-4 py-3 text-sm"
                        >
                          <span className="font-medium text-ink">
                            {copy.table} {item.tableNumber}
                          </span>
                          <span className="text-muted">
                            {item.value} {copy.requestsLower}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
