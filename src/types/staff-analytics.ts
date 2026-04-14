export type AnalyticsRangeDays = 7 | 14 | 30;

export type AnalyticsPoint = {
  key: string;
  label: string;
  value: number;
};

export type AnalyticsStatusPoint = {
  key: string;
  label: string;
  new: number;
  preparing: number;
  ready: number;
  served: number;
};

export type AnalyticsRankingPoint = {
  label: string;
  value: number;
};

export type AnalyticsPaymentMethodPoint = {
  label: string;
  orders: number;
  sales: number;
};

export type AnalyticsRewardPoint = {
  label: string;
  issued: number;
  redeemed: number;
};

export type AnalyticsRequestTablePoint = {
  tableNumber: string;
  value: number;
};

export type AnalyticsHeatmap = {
  days: string[];
  hours: string[];
  values: number[][];
  maxValue: number;
};

export type AnalyticsKpis = {
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
  averagePrepMinutes: number | null;
  rewardsIssued: number;
  rewardsRedeemed: number;
  rewardRedemptionRate: number;
  totalRequests: number;
};

export type StaffAnalyticsPayload = {
  rangeDays: AnalyticsRangeDays;
  generatedAt: string;
  kpis: AnalyticsKpis;
  salesByDay: AnalyticsPoint[];
  salesByHour: AnalyticsPoint[];
  heatmap: AnalyticsHeatmap;
  ordersByDay: AnalyticsPoint[];
  averageTicketByDay: AnalyticsPoint[];
  topProductsByQuantity: AnalyticsRankingPoint[];
  topProductsByRevenue: AnalyticsRankingPoint[];
  salesByCategory: AnalyticsRankingPoint[];
  paymentMethods: AnalyticsPaymentMethodPoint[];
  orderStatusByDay: AnalyticsStatusPoint[];
  prepTimeByDay: AnalyticsPoint[];
  rewardPerformance: {
    issued: number;
    redeemed: number;
    redemptionRate: number;
    byPrize: AnalyticsRewardPoint[];
  };
  requestPerformance: {
    requestsByDay: AnalyticsPoint[];
    requestsByHour: AnalyticsPoint[];
    topTables: AnalyticsRequestTablePoint[];
  };
};
