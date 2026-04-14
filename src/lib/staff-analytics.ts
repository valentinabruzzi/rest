import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DATA_CACHE_TAGS } from "@/lib/data-cache";
import { normalizeActiveOrderStatus } from "@/lib/order-status";
import {
  getActualPaymentMethod,
} from "@/lib/order-payment";
import { getStaffRequestKind, parseStaffRequestNote } from "@/lib/staff-request";
import type {
  AnalyticsHeatmap,
  AnalyticsPaymentMethodPoint,
  AnalyticsPoint,
  AnalyticsRangeDays,
  AnalyticsRankingPoint,
  AnalyticsRequestTablePoint,
  AnalyticsRewardPoint,
  AnalyticsStatusPoint,
  StaffAnalyticsPayload,
} from "@/types/staff-analytics";
import type { OrderColumn } from "@/types/staff-orders";

const TIME_ZONE = "Europe/Rome";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};
const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const dayLabelFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
});

function getDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    weekday: get("weekday"),
  };
}

function getDayKey(date: Date) {
  const parts = getDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getDayLabel(date: Date) {
  return dayLabelFormatter.format(date);
}

function getHourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function createRangeDays(rangeDays: AnalyticsRangeDays) {
  const points: Array<{ key: string; label: string }> = [];

  for (let offset = rangeDays - 1; offset >= 0; offset -= 1) {
    const pointDate = new Date(Date.now() - offset * DAY_MS);
    points.push({
      key: getDayKey(pointDate),
      label: getDayLabel(pointDate),
    });
  }

  return points;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function toRankingPoints(
  source: Map<string, number>,
  limit: number = 6
): AnalyticsRankingPoint[] {
  return [...source.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function classifyPaymentMethod(order: {
  paymentStatus: string;
  paymentMeta: unknown;
  payments: { provider: string }[];
  staffRequests: { note: string | null }[];
}) {
  if (order.paymentStatus === "paid_online") return "Carta / wallet online";
  if (order.paymentStatus === "paid_counter_card") return "Carta in cassa";
  if (order.paymentStatus === "paid_cash") return "Contanti in cassa";
  if (order.paymentStatus === "paid_at_table") {
    const actualMethod = getActualPaymentMethod(
      order.paymentMeta as Parameters<typeof getActualPaymentMethod>[0]
    );
    if (actualMethod === "card") return "Carta al tavolo";
    if (actualMethod === "cash") return "Contanti al tavolo";
    return "Pagamento al tavolo";
  }

  const paymentRequest = order.staffRequests.find(
    (request) => getStaffRequestKind(request.note) === "payment_request"
  );
  const parsed = paymentRequest ? parseStaffRequestNote(paymentRequest.note) : null;

  if (parsed?.requestType === "payment_card") return "Carta al tavolo";
  if (parsed?.requestType === "payment_cash") return "Contanti al tavolo";

  const provider = order.payments[0]?.provider ?? "";
  if (provider === "stripe") return "Carta / wallet online";
  if (provider === "counter") return "Pagamento in cassa";
  return "Altro";
}

function createEmptyStatusPoint(key: string, label: string): AnalyticsStatusPoint {
  return {
    key,
    label,
    new: 0,
    preparing: 0,
    ready: 0,
    served: 0,
  };
}

function toOrderColumn(status: string): OrderColumn {
  return normalizeActiveOrderStatus(status);
}

export async function buildStaffAnalytics(
  rangeDays: AnalyticsRangeDays,
  restaurantId: string
): Promise<StaffAnalyticsPayload> {
  return getCachedStaffAnalytics(restaurantId, rangeDays);
}

const getCachedStaffAnalytics = unstable_cache(
  async (
    restaurantId: string,
    rangeDays: AnalyticsRangeDays
  ): Promise<StaffAnalyticsPayload> => {
    const dayRange = createRangeDays(rangeDays);
    const dayRangeMap = new Map(dayRange.map((point) => [point.key, point.label]));
    const fromDate = new Date(Date.now() - rangeDays * DAY_MS);

    const [orders, rewards, requests] = await Promise.all([
      prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: fromDate },
          status: { notIn: ["draft", "placed_unpaid", "pending_payment", "cancelled"] },
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  category: {
                    select: { name: true },
                  },
                },
              },
            },
          },
          payments: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          staffRequests: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.orderReward.findMany({
        where: {
          order: {
            restaurantId,
          },
          createdAt: { gte: fromDate },
          prizeType: { not: "none" },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.staffRequest.findMany({
        where: {
          restaurantId,
          createdAt: { gte: fromDate },
        },
        include: {
          table: {
            select: { tableNumber: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const salesByDay = new Map<string, number>();
    const ordersByDay = new Map<string, number>();
    const averageTicketAccumulator = new Map<
      string,
      { sales: number; orders: number }
    >();
    const hourlySales = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      value: 0,
    }));
    const heatmapValues = Array.from({ length: 7 }, () => Array(24).fill(0));
    const topProductsQuantity = new Map<string, number>();
    const topProductsRevenue = new Map<string, number>();
    const categorySales = new Map<string, number>();
    const paymentMethods = new Map<string, { orders: number; sales: number }>();
    const orderStatusByDay = new Map<string, AnalyticsStatusPoint>();
    const prepTimeByDayAccumulator = new Map<string, { total: number; count: number }>();
    let totalSales = 0;
    let totalOrders = 0;
    let totalPrepMinutes = 0;
    let prepSamples = 0;

    for (const order of orders) {
    const createdAt = new Date(order.createdAt);
    const dayKey = getDayKey(createdAt);
    const parts = getDateParts(createdAt);
    const dayLabel = dayRangeMap.get(dayKey);

    if (!dayLabel) continue;

    totalSales += order.total;
    totalOrders += 1;
    salesByDay.set(dayKey, (salesByDay.get(dayKey) ?? 0) + order.total);
    ordersByDay.set(dayKey, (ordersByDay.get(dayKey) ?? 0) + 1);
    averageTicketAccumulator.set(dayKey, {
      sales: (averageTicketAccumulator.get(dayKey)?.sales ?? 0) + order.total,
      orders: (averageTicketAccumulator.get(dayKey)?.orders ?? 0) + 1,
    });

    hourlySales[parts.hour].value += order.total;
    const weekdayIndex = WEEKDAY_INDEX[parts.weekday] ?? 0;
    heatmapValues[weekdayIndex][parts.hour] += 1;

    const paymentMethod = classifyPaymentMethod(order);
    paymentMethods.set(paymentMethod, {
      orders: (paymentMethods.get(paymentMethod)?.orders ?? 0) + 1,
      sales: (paymentMethods.get(paymentMethod)?.sales ?? 0) + order.total,
    });

    const statusPoint =
      orderStatusByDay.get(dayKey) ?? createEmptyStatusPoint(dayKey, dayLabel);
    const currentStatus = toOrderColumn(order.status);
    statusPoint[currentStatus] += 1;
    orderStatusByDay.set(dayKey, statusPoint);

    if (order.preparingAt && order.readyAt) {
      const prepMinutes =
        (new Date(order.readyAt).getTime() - new Date(order.preparingAt).getTime()) /
        60000;
      if (prepMinutes >= 0) {
        totalPrepMinutes += prepMinutes;
        prepSamples += 1;
        prepTimeByDayAccumulator.set(dayKey, {
          total: (prepTimeByDayAccumulator.get(dayKey)?.total ?? 0) + prepMinutes,
          count: (prepTimeByDayAccumulator.get(dayKey)?.count ?? 0) + 1,
        });
      }
    }

    for (const item of order.items) {
      topProductsQuantity.set(
        item.productNameSnapshot,
        (topProductsQuantity.get(item.productNameSnapshot) ?? 0) + item.quantity
      );
      topProductsRevenue.set(
        item.productNameSnapshot,
        (topProductsRevenue.get(item.productNameSnapshot) ?? 0) + item.lineTotal
      );

      const categoryName = item.product.category?.name ?? "Senza categoria";
      categorySales.set(
        categoryName,
        (categorySales.get(categoryName) ?? 0) + item.lineTotal
      );
    }
    }

    const salesByDaySeries: AnalyticsPoint[] = dayRange.map(({ key, label }) => ({
      key,
      label,
      value: salesByDay.get(key) ?? 0,
    }));

    const ordersByDaySeries: AnalyticsPoint[] = dayRange.map(({ key, label }) => ({
      key,
      label,
      value: ordersByDay.get(key) ?? 0,
    }));

    const averageTicketByDay: AnalyticsPoint[] = dayRange.map(({ key, label }) => {
      const bucket = averageTicketAccumulator.get(key);
      return {
        key,
        label,
        value: bucket && bucket.orders > 0 ? roundOne(bucket.sales / bucket.orders) : 0,
      };
    });

    const salesByHour: AnalyticsPoint[] = hourlySales.map(({ hour, value }) => ({
      key: String(hour),
      label: getHourLabel(hour),
      value,
    }));

    const heatmap: AnalyticsHeatmap = {
      days: WEEKDAY_LABELS,
      hours: Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")),
      values: heatmapValues,
      maxValue: Math.max(1, ...heatmapValues.flat()),
    };

    const paymentMethodSeries: AnalyticsPaymentMethodPoint[] = [
      ...paymentMethods.entries(),
    ]
      .sort((a, b) => b[1].sales - a[1].sales)
      .map(([label, value]) => ({
        label,
        orders: value.orders,
        sales: value.sales,
      }));

    const statusSeries: AnalyticsStatusPoint[] = dayRange.map(({ key, label }) => {
      return orderStatusByDay.get(key) ?? createEmptyStatusPoint(key, label);
    });

    const prepTimeByDay: AnalyticsPoint[] = dayRange.map(({ key, label }) => {
      const bucket = prepTimeByDayAccumulator.get(key);
      return {
        key,
        label,
        value: bucket && bucket.count > 0 ? roundOne(bucket.total / bucket.count) : 0,
      };
    });

    const rewardByPrize = new Map<string, { issued: number; redeemed: number }>();
    let rewardsIssued = 0;
    let rewardsRedeemed = 0;

    for (const reward of rewards) {
    rewardsIssued += 1;
    if (reward.redeemedAt) rewardsRedeemed += 1;

    const label =
      reward.prizeType === "cocktail"
        ? "Cocktail gratis"
        : "Cocktail + aperitivo";
    rewardByPrize.set(label, {
      issued: (rewardByPrize.get(label)?.issued ?? 0) + 1,
      redeemed: (rewardByPrize.get(label)?.redeemed ?? 0) + (reward.redeemedAt ? 1 : 0),
    });
    }

    const requestByDay = new Map<string, number>();
    const requestByHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      value: 0,
    }));
    const requestTopTables = new Map<string, number>();

    for (const request of requests) {
    const createdAt = new Date(request.createdAt);
    const dayKey = getDayKey(createdAt);
    const dayLabel = dayRangeMap.get(dayKey);
    if (dayLabel) {
      requestByDay.set(dayKey, (requestByDay.get(dayKey) ?? 0) + 1);
    }

    const hour = getDateParts(createdAt).hour;
    requestByHour[hour].value += 1;
    requestTopTables.set(
      request.table.tableNumber,
      (requestTopTables.get(request.table.tableNumber) ?? 0) + 1
    );
    }

    const rewardPerformanceByPrize: AnalyticsRewardPoint[] = [
      ...rewardByPrize.entries(),
    ]
      .map(([label, value]) => ({
        label,
        issued: value.issued,
        redeemed: value.redeemed,
      }))
      .sort((a, b) => b.issued - a.issued);

    const requestPerformance = {
      requestsByDay: dayRange.map(({ key, label }) => ({
        key,
        label,
        value: requestByDay.get(key) ?? 0,
      })),
      requestsByHour: requestByHour.map(({ hour, value }) => ({
        key: String(hour),
        label: getHourLabel(hour),
        value,
      })),
      topTables: [...requestTopTables.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(
          ([tableNumber, value]): AnalyticsRequestTablePoint => ({
            tableNumber,
            value,
          })
        ),
    };

    return {
      rangeDays,
      generatedAt: new Date().toISOString(),
      kpis: {
        totalSales,
        totalOrders,
        averageTicket: totalOrders > 0 ? roundOne(totalSales / totalOrders) : 0,
        averagePrepMinutes:
          prepSamples > 0 ? roundOne(totalPrepMinutes / prepSamples) : null,
        rewardsIssued,
        rewardsRedeemed,
        rewardRedemptionRate:
          rewardsIssued > 0 ? roundOne((rewardsRedeemed / rewardsIssued) * 100) : 0,
        totalRequests: requests.length,
      },
      salesByDay: salesByDaySeries,
      salesByHour,
      heatmap,
      ordersByDay: ordersByDaySeries,
      averageTicketByDay,
      topProductsByQuantity: toRankingPoints(topProductsQuantity),
      topProductsByRevenue: toRankingPoints(topProductsRevenue),
      salesByCategory: toRankingPoints(categorySales),
      paymentMethods: paymentMethodSeries,
      orderStatusByDay: statusSeries,
      prepTimeByDay,
      rewardPerformance: {
        issued: rewardsIssued,
        redeemed: rewardsRedeemed,
        redemptionRate:
          rewardsIssued > 0 ? roundOne((rewardsRedeemed / rewardsIssued) * 100) : 0,
        byPrize: rewardPerformanceByPrize,
      },
      requestPerformance,
    };
  },
  ["staff-analytics"],
  {
    revalidate: 60,
    tags: [DATA_CACHE_TAGS.staffAnalytics],
  }
);
