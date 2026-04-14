import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DATA_CACHE_TAGS } from "@/lib/data-cache";
import {
  type DishRadarConfig,
  getDishRadarDynamicUnavailableIds,
  getDishRadarMenuEditorIngredients,
  getRestaurantDishRadarConfig,
} from "@/lib/dish-radar";
import { parseItemNotes } from "@/lib/item-notes";
import { normalizeProductNameTranslations } from "@/lib/menu-item-name";
import { sanitizeProductImageUrl } from "@/lib/product-image";
import { normalizeProductCustomerNotesConfig } from "@/lib/product-customer-notes";
import { normalizeActiveOrderStatus } from "@/lib/order-status";
import {
  getPaymentMarker,
  getPendingPaymentFlow,
  getPendingPaymentMethodLabel,
  getRequestedPaymentMethod,
  isReleasedPaymentStatus,
} from "@/lib/order-payment";
import {
  classifyPrepStation,
  ensureStoredPrepStationMap,
  getReadyPrepStations,
  type DashboardRole,
  type PrepStation,
  type StoredPrepStationMap,
} from "@/lib/order-stations";
import { toStaffRequestSummary } from "@/lib/staff-request";
import type { ProductCustomerNoteSelection } from "@/lib/product-customer-notes";
import type { DishRadarMenuEditorIngredientRow } from "@/types/staff-availability";
import type { StaffRequestSummary } from "@/types/staff-request";
import type { MenuCategory } from "@/types/menu";

const STAFF_TIME_ZONE = "Europe/Rome";
const DAY_MS = 24 * 60 * 60 * 1000;

export type StaffServedRange = "hour" | "today" | "week" | "month" | "year";

export type StaffOrderRowData = {
  id: string;
  orderNumber: string;
  status: "new" | "preparing" | "ready" | "served";
  rawStatus: string;
  stationStatus: StoredPrepStationMap;
  readyStations: PrepStation[];
  paymentStatus: string;
  paymentReleased: boolean;
  pendingPaymentFlow: "cashier" | "waiter" | null;
  pendingPaymentMethod: string;
  requestedPaymentMethod: "card" | "cash" | null;
  paymentMarkedByRole: DashboardRole | "system" | string | null;
  paymentMarkedByLabel: string | null;
  paidAt: string | null;
  servedAt: string | null;
  total: number;
  tableNumber: string;
  restaurantName: string;
  createdAt: string;
  customerNote: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    lineTotal: number;
    selectedNotes: ProductCustomerNoteSelection[];
    notes: string | null;
    selectedOptions: unknown;
    station: PrepStation;
    categoryName: string | null;
  }>;
};

export type StaffMenuCategoryRow = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

export type StaffMenuItemRow = {
  id: string;
  name: string;
  nameTranslations: ReturnType<typeof normalizeProductNameTranslations>;
  description: string;
  price: number;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
  categoryId: string | null;
  categoryName: string;
  categoryActive: boolean;
  categorySortOrder: number;
  isUncategorized: boolean;
  customerNotes: ReturnType<typeof normalizeProductCustomerNotesConfig>;
  ingredients: DishRadarMenuEditorIngredientRow[];
};

export type StaffTableRow = {
  id: string;
  tableNumber: string;
};

const orderTakingProductInclude = {
  optionGroups: {
    include: {
      options: true,
    },
    orderBy: {
      name: "asc",
    },
  },
} satisfies Prisma.ProductInclude;

type OrderTakingProductRecord = Prisma.ProductGetPayload<{
  include: typeof orderTakingProductInclude;
}>;

const staffOrderInclude = {
  table: true,
  restaurant: { select: { name: true, slug: true } },
  items: {
    include: {
      product: {
        include: {
          category: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.OrderInclude;

type StaffOrderRecord = Prisma.OrderGetPayload<{
  include: typeof staffOrderInclude;
}>;

function getTimeZoneDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeZoneDateParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asUtc - date.getTime();
}

function getStartOfTodayInTimeZone(date: Date, timeZone: string) {
  const parts = getTimeZoneDateParts(date, timeZone);
  const utcGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0)
  );
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);

  return new Date(utcGuess.getTime() - offset);
}

function getServedRangeStart(range: StaffServedRange, now: Date = new Date()) {
  if (range === "hour") return new Date(now.getTime() - 60 * 60 * 1000);
  if (range === "today") return getStartOfTodayInTimeZone(now, STAFF_TIME_ZONE);
  if (range === "week") return new Date(now.getTime() - 7 * DAY_MS);
  if (range === "month") return new Date(now.getTime() - 30 * DAY_MS);
  return new Date(now.getTime() - 365 * DAY_MS);
}

function serializeStaffOrder(order: StaffOrderRecord): StaffOrderRowData {
  const released = isReleasedPaymentStatus(order.paymentStatus);
  const stationStatus = released
    ? ensureStoredPrepStationMap(
        order.items.map((item) => ({
          name: item.productNameSnapshot,
          categoryName: item.product.category?.name ?? null,
          tags: item.product.tags,
        })),
        order.stationStatus,
        order.status
      )
    : {};
  const pendingPaymentFlow = getPendingPaymentFlow(order.paymentMeta);
  const requestedPaymentMethod = getRequestedPaymentMethod(order.paymentMeta);
  const paymentMarker = getPaymentMarker(order.paymentMeta);

  return {
    stationStatus,
    id: order.id,
    orderNumber: order.orderNumber,
    status: normalizeActiveOrderStatus(order.status),
    rawStatus: order.status,
    paymentStatus: order.paymentStatus,
    paymentReleased: released,
    pendingPaymentFlow,
    pendingPaymentMethod: getPendingPaymentMethodLabel({
      requestedMethod: requestedPaymentMethod,
      flow: pendingPaymentFlow,
    }),
    requestedPaymentMethod,
    paymentMarkedByRole: paymentMarker.role,
    paymentMarkedByLabel: paymentMarker.label,
    paidAt: order.paidAt?.toISOString() ?? null,
    servedAt:
      order.servedAt?.toISOString() ??
      (order.status === "served" ? order.updatedAt.toISOString() : null),
    total: order.total,
    customerNote: order.customerNote,
    createdAt: order.createdAt.toISOString(),
    tableNumber: order.table.tableNumber,
    restaurantName: order.restaurant.name,
    readyStations: released ? getReadyPrepStations(stationStatus) : [],
    items: order.items.map((item) => {
      const parsedNotes = parseItemNotes(item.notes);
      const station: PrepStation = classifyPrepStation({
        name: item.productNameSnapshot,
        categoryName: item.product.category?.name ?? null,
        tags: item.product.tags,
      });
      return {
        id: item.id,
        name: item.productNameSnapshot,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        notes: parsedNotes.note,
        selectedNotes: parsedNotes.selections,
        selectedOptions: item.selectedOptions,
        station,
        categoryName: item.product.category?.name ?? null,
      };
    }),
  };
}

function serializeOrderTakingProduct(
  product: OrderTakingProductRecord
): MenuCategory["products"][number] {
  return {
    id: product.id,
    name: product.name,
    nameTranslations: normalizeProductNameTranslations(product.nameTranslations),
    description: product.description,
    price: product.price,
    imageUrl: sanitizeProductImageUrl(product.imageUrl),
    volumeLabel: product.volumeLabel,
    allergens: product.allergens,
    tags: product.tags,
    customerNotes: normalizeProductCustomerNotesConfig(product.customerNotesConfig),
    optionGroups: product.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      required: group.required,
      multiple: group.multiple,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: option.priceDelta,
      })),
    })),
  };
}

function serializeStaffMenuProduct(
  product: Prisma.ProductGetPayload<{
    include: {
      category: {
        select: {
          id: true;
          name: true;
          active: true;
          sortOrder: true;
        };
      };
    };
  }>,
  dishRadarConfig: DishRadarConfig
): StaffMenuItemRow {
  return {
    id: product.id,
    name: product.name,
    nameTranslations: normalizeProductNameTranslations(product.nameTranslations),
    description: product.description,
    price: product.price,
    imageUrl: sanitizeProductImageUrl(product.imageUrl),
    active: product.active,
    sortOrder: product.sortOrder,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? "No category yet",
    categoryActive: product.category?.active ?? true,
    categorySortOrder: product.category?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    isUncategorized: product.categoryId == null,
    customerNotes: normalizeProductCustomerNotesConfig(product.customerNotesConfig),
    ingredients: getDishRadarMenuEditorIngredients({
      config: dishRadarConfig,
      productId: product.id,
    }),
  };
}

export async function getStaffOrdersPayload(
  restaurantId: string,
  options?: {
    servedRange?: StaffServedRange;
  }
): Promise<StaffOrderRowData[]> {
  const servedRange = options?.servedRange ?? "today";
  const servedRangeStart = getServedRangeStart(servedRange);

  const [activeOrders, servedOrders] = await Promise.all([
    prisma.order.findMany({
      where: {
        restaurantId,
        status: {
          notIn: ["draft", "cancelled", "served"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: staffOrderInclude,
    }),
    prisma.order.findMany({
      where: {
        restaurantId,
        status: "served",
        OR: [
          {
            servedAt: {
              gte: servedRangeStart,
            },
          },
          {
            servedAt: null,
            updatedAt: {
              gte: servedRangeStart,
            },
          },
        ],
      },
      orderBy: [{ servedAt: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
      include: staffOrderInclude,
    }),
  ]);

  return [...activeOrders, ...servedOrders].map(serializeStaffOrder);
}

export async function getStaffRequestsPayload(
  restaurantId: string
): Promise<StaffRequestSummary[]> {
  const requests = await prisma.staffRequest.findMany({
    where: {
      restaurantId,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 80,
    include: {
      table: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
        },
      },
      restaurant: {
        select: {
          name: true,
        },
      },
    },
  });

  return requests.map((request) =>
    toStaffRequestSummary({
      id: request.id,
      type: request.type,
      note: request.note,
      status: request.status,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      closedAt: request.closedAt,
      restaurantName: request.restaurant.name,
      tableNumber: request.table.tableNumber,
      orderId: request.order?.id ?? null,
      orderNumber: request.order?.orderNumber ?? null,
    })
  );
}

export async function getStaffMenuEditorPayload(
  restaurantId: string
): Promise<{
  categories: StaffMenuCategoryRow[];
  items: StaffMenuItemRow[];
}> {
  return getCachedStaffMenuEditorPayload(restaurantId);
}

const getCachedStaffMenuEditorPayload = unstable_cache(
  async (
    restaurantId: string
  ): Promise<{
    categories: StaffMenuCategoryRow[];
    items: StaffMenuItemRow[];
  }> => {
    const [restaurant, categories, products] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          settings: true,
        },
      }),
      prisma.category.findMany({
        where: { restaurantId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          active: true,
          sortOrder: true,
        },
      }),
      prisma.product.findMany({
        where: { restaurantId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          category: {
            select: {
              id: true,
              name: true,
              active: true,
              sortOrder: true,
            },
          },
        },
      }),
    ]);
    const dishRadarConfig = getRestaurantDishRadarConfig(restaurant?.settings);

    return {
      categories,
      items: products
        .map((product) => serializeStaffMenuProduct(product, dishRadarConfig))
        .sort(
          (left, right) =>
            left.categorySortOrder - right.categorySortOrder ||
            left.sortOrder - right.sortOrder ||
            left.name.localeCompare(right.name, "it")
        ),
    };
  },
  ["staff-menu-editor-payload"],
  {
    revalidate: 60,
    tags: [DATA_CACHE_TAGS.staffMenu],
  }
);

export async function getStaffTablesPayload(
  restaurantId: string
): Promise<StaffTableRow[]> {
  return getCachedStaffTablesPayload(restaurantId);
}

const getCachedStaffTablesPayload = unstable_cache(
  async (restaurantId: string): Promise<StaffTableRow[]> =>
    prisma.table.findMany({
      where: {
        restaurantId,
        active: true,
      },
      orderBy: { tableNumber: "asc" },
      select: {
        id: true,
        tableNumber: true,
      },
    }),
  ["staff-tables-payload"],
  {
    revalidate: 60,
    tags: [DATA_CACHE_TAGS.staffOrderTaking],
  }
);

export type StaffOrderTakingPayload = {
  tables: StaffTableRow[];
  categories: MenuCategory[];
  currency: string;
  serviceFeePercent: number;
};

export async function getStaffOrderTakingPayload(args: {
  restaurantId: string;
}): Promise<StaffOrderTakingPayload> {
  return getCachedStaffOrderTakingPayload(args.restaurantId);
}

const getCachedStaffOrderTakingPayload = unstable_cache(
  async (restaurantId: string): Promise<StaffOrderTakingPayload> => {
    const [restaurant, tables, categories, uncategorizedProducts] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          currency: true,
          serviceFeePercent: true,
          settings: true,
        },
      }),
      getCachedStaffTablesPayload(restaurantId),
      prisma.category.findMany({
        where: {
          restaurantId,
          active: true,
        },
        orderBy: {
          sortOrder: "asc",
        },
        include: {
          products: {
            where: {
              active: true,
            },
            orderBy: {
              sortOrder: "asc",
            },
            include: orderTakingProductInclude,
          },
        },
      }),
      prisma.product.findMany({
        where: {
          restaurantId,
          active: true,
          categoryId: null,
        },
        orderBy: {
          sortOrder: "asc",
        },
        include: orderTakingProductInclude,
      }),
    ]);

    const dynamicallyUnavailableIds = getDishRadarDynamicUnavailableIds({
      settings: restaurant?.settings,
      products: [
        ...categories.flatMap((category) =>
          category.products.map((product) => ({
            id: product.id,
            name: product.name,
            active: product.active,
          }))
        ),
        ...uncategorizedProducts.map((product) => ({
          id: product.id,
          name: product.name,
          active: product.active,
        })),
      ],
    });

    const serializedCategories: MenuCategory[] = categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        products: category.products
          .filter((product) => !dynamicallyUnavailableIds.has(product.id))
          .map((product) => serializeOrderTakingProduct(product)),
      }))
      .filter((category) => category.products.length > 0);

    if (uncategorizedProducts.length > 0) {
      const visibleUncategorizedProducts = uncategorizedProducts.filter(
        (product) => !dynamicallyUnavailableIds.has(product.id)
      );

      if (visibleUncategorizedProducts.length > 0) {
        serializedCategories.push({
          id: "__uncategorized__",
          name: "Senza categoria",
          sortOrder:
            (serializedCategories[serializedCategories.length - 1]?.sortOrder ?? -1) +
            1,
          products: visibleUncategorizedProducts.map((product) =>
            serializeOrderTakingProduct(product)
          ),
        });
      }
    }

    return {
      tables,
      categories: serializedCategories,
      currency: restaurant?.currency?.toUpperCase() ?? "EUR",
      serviceFeePercent: Number(restaurant?.serviceFeePercent ?? 0),
    };
  },
  ["staff-order-taking-payload"],
  {
    revalidate: 60,
    tags: [DATA_CACHE_TAGS.staffOrderTaking],
  }
);
