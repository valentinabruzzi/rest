import { prisma } from "@/lib/prisma";
import {
  DISH_RADAR_UNITS,
  getDishRadarAvailabilityMap,
  getRestaurantDishRadarConfig,
  toDishRadarConfigRows,
} from "@/lib/dish-radar";
import type {
  DishRadarIngredientInsight,
  DishRadarProductInsight,
  DishRadarRecipeItem,
  DishRadarSuggestedAction,
  DishRadarStatus,
  StaffAvailabilityPayload,
} from "@/types/staff-availability";

const TIME_ZONE = "Europe/Rome";
const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;
const LOOKBACK_DAYS = 21;
const MIN_TRAINING_ROWS = 12;

type ProductRow = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

type OrderHistoryRow = {
  createdAt: Date;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
};

type BucketMeta = {
  bucketStart: Date;
  slot: number;
  weekdayIndex: number;
  weekend: boolean;
};

type DemandModel = {
  fallback: boolean;
  weights: number[];
  means: number[];
  stds: number[];
  slotAverages: Map<string, number>;
};

const datePartFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

function getDateParts(date: Date) {
  const parts = datePartFormatter.formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekday = get("weekday");
  const weekdayIndex =
    weekday === "Mon"
      ? 0
      : weekday === "Tue"
        ? 1
        : weekday === "Wed"
          ? 2
          : weekday === "Thu"
            ? 3
            : weekday === "Fri"
              ? 4
              : weekday === "Sat"
                ? 5
                : 6;

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekdayIndex,
    weekend: weekdayIndex >= 5,
  };
}

function floorToHalfHour(date: Date) {
  return new Date(Math.floor(date.getTime() / HALF_HOUR_MS) * HALF_HOUR_MS);
}

function getBucketMeta(date: Date): BucketMeta {
  const bucketStart = floorToHalfHour(date);
  const parts = getDateParts(bucketStart);
  const minuteSlot = parts.minute >= 30 ? 1 : 0;

  return {
    bucketStart,
    slot: parts.hour * 2 + minuteSlot,
    weekdayIndex: parts.weekdayIndex,
    weekend: parts.weekend,
  };
}

function getBucketKey(meta: BucketMeta) {
  return meta.bucketStart.toISOString();
}

function getLocalDayKey(date: Date) {
  const parts = getDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function roundQuantity(value: number) {
  return Math.round(value * 100) / 100;
}

function roundForecast(value: number) {
  return Math.max(0, Math.round(value * 10) / 10);
}

function buildTimeline(now: Date) {
  const start = floorToHalfHour(new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS));
  const end = floorToHalfHour(now);
  const buckets: BucketMeta[] = [];

  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += HALF_HOUR_MS) {
    buckets.push(getBucketMeta(new Date(cursor)));
  }

  return buckets;
}

function dot(left: number[], right: number[]) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return total;
}

function fitDemandModel(series: number[], timeline: BucketMeta[]): DemandModel {
  const slotAccumulator = new Map<string, { sum: number; count: number }>();
  const slotAverages = new Map<string, number>();
  const rows: Array<{ features: number[]; target: number }> = [];

  for (let index = 0; index < series.length; index += 1) {
    const meta = timeline[index];
    const slotKey = `${meta.weekdayIndex}-${meta.slot}`;
    const slotStats = slotAccumulator.get(slotKey);
    const sameSlotAverage =
      slotStats && slotStats.count > 0 ? slotStats.sum / slotStats.count : 0;

    if (index >= 2) {
      rows.push({
        features: [
          Math.sin((2 * Math.PI * meta.slot) / 48),
          Math.cos((2 * Math.PI * meta.slot) / 48),
          meta.weekend ? 1 : 0,
          series[index - 1] ?? 0,
          series[index - 2] ?? 0,
          sameSlotAverage,
        ],
        target: series[index] ?? 0,
      });
    }

    slotAccumulator.set(slotKey, {
      sum: (slotStats?.sum ?? 0) + (series[index] ?? 0),
      count: (slotStats?.count ?? 0) + 1,
    });
  }

  for (const [key, value] of slotAccumulator.entries()) {
    slotAverages.set(key, value.count > 0 ? value.sum / value.count : 0);
  }

  if (rows.length < MIN_TRAINING_ROWS) {
    return {
      fallback: true,
      weights: [],
      means: [],
      stds: [],
      slotAverages,
    };
  }

  const featureCount = rows[0]?.features.length ?? 0;
  const means = Array(featureCount).fill(0);
  const stds = Array(featureCount).fill(1);

  for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
    const values = rows.map((row) => row.features[featureIndex] ?? 0);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    means[featureIndex] = mean;
    stds[featureIndex] = variance > 0 ? Math.sqrt(variance) : 1;
  }

  const normalizedRows = rows.map((row) => ({
    x: [
      1,
      ...row.features.map(
        (value, featureIndex) => (value - means[featureIndex]) / stds[featureIndex]
      ),
    ],
    y: row.target,
  }));

  const weights = Array(featureCount + 1).fill(0);
  const learningRate = 0.05;
  const regularization = 0.001;

  for (let iteration = 0; iteration < 300; iteration += 1) {
    const gradients = Array(featureCount + 1).fill(0);

    for (const row of normalizedRows) {
      const prediction = dot(weights, row.x);
      const error = prediction - row.y;

      for (let featureIndex = 0; featureIndex < gradients.length; featureIndex += 1) {
        gradients[featureIndex] += error * row.x[featureIndex];
      }
    }

    for (let featureIndex = 0; featureIndex < weights.length; featureIndex += 1) {
      const penalty = featureIndex === 0 ? 0 : regularization * weights[featureIndex];
      weights[featureIndex] -=
        (learningRate * (gradients[featureIndex] / normalizedRows.length + penalty));
    }
  }

  return {
    fallback: false,
    weights,
    means,
    stds,
    slotAverages,
  };
}

function predictDemand(
  model: DemandModel,
  currentTimeline: BucketMeta[],
  currentSeries: number[],
  steps: number
) {
  const predictions: number[] = [];
  const history = [...currentSeries];
  const lastBucketStart =
    currentTimeline[currentTimeline.length - 1]?.bucketStart ?? floorToHalfHour(new Date());

  for (let step = 1; step <= steps; step += 1) {
    const nextMeta = getBucketMeta(
      new Date(lastBucketStart.getTime() + step * HALF_HOUR_MS)
    );
    const slotKey = `${nextMeta.weekdayIndex}-${nextMeta.slot}`;
    const sameSlotAverage = model.slotAverages.get(slotKey) ?? 0;
    const prev1 = history[history.length - 1] ?? 0;
    const prev2 = history[history.length - 2] ?? 0;

    let nextValue = 0;

    if (model.fallback) {
      nextValue = sameSlotAverage * 0.65 + prev1 * 0.25 + prev2 * 0.1;
    } else {
      const rawFeatures = [
        Math.sin((2 * Math.PI * nextMeta.slot) / 48),
        Math.cos((2 * Math.PI * nextMeta.slot) / 48),
        nextMeta.weekend ? 1 : 0,
        prev1,
        prev2,
        sameSlotAverage,
      ];
      const normalized = rawFeatures.map(
        (value, featureIndex) => (value - model.means[featureIndex]) / model.stds[featureIndex]
      );
      nextValue = dot(model.weights, [1, ...normalized]);
    }

    const clamped = roundForecast(nextValue);
    predictions.push(clamped);
    history.push(clamped);
  }

  return predictions;
}

function computeSellablePortionsFromStocks(
  recipe: DishRadarRecipeItem[],
  stockByIngredientId: Map<string, number>
) {
  if (recipe.length === 0) {
    return {
      sellablePortions: null,
      criticalIngredientId: null,
    };
  }

  let sellablePortions = Number.POSITIVE_INFINITY;
  let criticalIngredientId: string | null = null;

  for (const recipeItem of recipe) {
    const stock = stockByIngredientId.get(recipeItem.ingredientId) ?? 0;
    const portions = Math.floor(stock / recipeItem.quantity);
    if (portions < sellablePortions) {
      sellablePortions = portions;
      criticalIngredientId = recipeItem.ingredientId;
    }
  }

  return {
    sellablePortions: Number.isFinite(sellablePortions) ? Math.max(0, sellablePortions) : 0,
    criticalIngredientId,
  };
}

function getSuggestedAction(args: {
  tracked: boolean;
  active: boolean;
  autoPause: boolean;
  sellableNow: number | null;
  projected30m: number | null;
}): DishRadarSuggestedAction {
  if (!args.tracked) return "track_recipe";
  if (!args.active) {
    return (args.sellableNow ?? 0) > 0 ? "restore" : "ok";
  }
  if ((args.sellableNow ?? 0) <= 0) return "stop_now";
  if ((args.sellableNow ?? 999) <= 5) return "mark_running_low";
  if ((args.projected30m ?? 999) <= 0 && args.autoPause) return "stop_now";
  if ((args.projected30m ?? 999) <= 5) return "watch_30m";
  return "ok";
}

export async function buildStaffAvailabilityPayload(
  restaurantId: string
): Promise<StaffAvailabilityPayload> {
  const now = new Date();
  const timeline = buildTimeline(now);
  const timelineKeys = timeline.map((bucket) => getBucketKey(bucket));

  const [restaurant, products, orders] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        settings: true,
      },
    }),
    prisma.product.findMany({
      where: {
        restaurantId,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        active: true,
        sortOrder: true,
      },
    }),
    prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: {
          gte: new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS),
        },
        status: {
          notIn: ["draft", "pending_payment", "placed_unpaid", "cancelled"],
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        items: {
          select: {
            productId: true,
            quantity: true,
          },
        },
      },
    }),
  ]);

  const settings = restaurant?.settings ?? null;
  const config = getRestaurantDishRadarConfig(settings);
  const productRows: ProductRow[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    active: product.active,
    sortOrder: product.sortOrder,
  }));
  const recipeByProductId = new Map(
    config.products.map((product) => [product.productId, product.recipe])
  );
  const availabilityMap = getDishRadarAvailabilityMap({
    settings,
    products: productRows,
  });

  const quantityByProductId = new Map<string, Map<string, number>>();
  const consumedTodayByIngredientId = new Map<string, number>();
  const todayKey = getLocalDayKey(now);
  for (const order of orders as OrderHistoryRow[]) {
    const bucketKey = getBucketKey(getBucketMeta(order.createdAt));
    const orderDayKey = getLocalDayKey(order.createdAt);
    for (const item of order.items) {
      const bucketMap =
        quantityByProductId.get(item.productId) ?? new Map<string, number>();
      bucketMap.set(bucketKey, (bucketMap.get(bucketKey) ?? 0) + item.quantity);
      quantityByProductId.set(item.productId, bucketMap);

      if (orderDayKey === todayKey) {
        const recipe = recipeByProductId.get(item.productId) ?? [];
        for (const recipeItem of recipe) {
          consumedTodayByIngredientId.set(
            recipeItem.ingredientId,
            roundQuantity(
              (consumedTodayByIngredientId.get(recipeItem.ingredientId) ?? 0) +
                recipeItem.quantity * item.quantity
            )
          );
        }
      }
    }
  }

  const currentStockByIngredientId = new Map(
    config.ingredients.map((ingredient) => [ingredient.id, ingredient.stock])
  );
  const forecast30UsageByIngredientId = new Map<string, number>();
  const forecast60UsageByIngredientId = new Map<string, number>();

  const productInsights: DishRadarProductInsight[] = productRows.map((product) => {
    const recipe = recipeByProductId.get(product.id) ?? [];
    const tracked = recipe.length > 0;
    const availability = availabilityMap.get(product.id);
    const series = timelineKeys.map(
      (key) => quantityByProductId.get(product.id)?.get(key) ?? 0
    );
    const model = fitDemandModel(series, timeline);
    const [forecast30m, nextHalfHour] = predictDemand(model, timeline, series, 2);
    const forecast60m = roundForecast((forecast30m ?? 0) + (nextHalfHour ?? 0));

    for (const recipeItem of recipe) {
      forecast30UsageByIngredientId.set(
        recipeItem.ingredientId,
        (forecast30UsageByIngredientId.get(recipeItem.ingredientId) ?? 0) +
          recipeItem.quantity * (forecast30m ?? 0)
      );
      forecast60UsageByIngredientId.set(
        recipeItem.ingredientId,
        (forecast60UsageByIngredientId.get(recipeItem.ingredientId) ?? 0) +
          recipeItem.quantity * forecast60m
      );
    }

    return {
      productId: product.id,
      name: product.name,
      active: product.active,
      tracked,
      autoPause: availability?.autoPause ?? true,
      sellableNow: availability?.sellablePortions ?? null,
      projectedSellable30m: null,
      projectedSellable60m: null,
      forecast30m: forecast30m ?? 0,
      forecast60m,
      status: !tracked
        ? "untracked"
        : !product.active
          ? "paused"
          : (availability?.sellablePortions ?? 0) <= 0
            ? "sold_out"
            : (availability?.sellablePortions ?? 999) <= 5
              ? "running_low"
              : "ok",
      criticalIngredientId: availability?.criticalIngredientId ?? null,
      criticalIngredientName: availability?.criticalIngredientName ?? null,
      suggestedAction: "ok",
    };
  });

  const projected30StockByIngredientId = new Map(currentStockByIngredientId);
  const projected60StockByIngredientId = new Map(currentStockByIngredientId);

  for (const [ingredientId, quantity] of forecast30UsageByIngredientId.entries()) {
    projected30StockByIngredientId.set(
      ingredientId,
      roundQuantity((projected30StockByIngredientId.get(ingredientId) ?? 0) - quantity)
    );
  }

  for (const [ingredientId, quantity] of forecast60UsageByIngredientId.entries()) {
    projected60StockByIngredientId.set(
      ingredientId,
      roundQuantity((projected60StockByIngredientId.get(ingredientId) ?? 0) - quantity)
    );
  }

  const finalizedProducts: DishRadarProductInsight[] = productInsights
    .map((product) => {
      const recipe = recipeByProductId.get(product.productId) ?? [];
      const projected30 = computeSellablePortionsFromStocks(
        recipe,
        projected30StockByIngredientId
      );
      const projected60 = computeSellablePortionsFromStocks(
        recipe,
        projected60StockByIngredientId
      );

      const sellableNow = product.sellableNow;
      const projectedSellable30m = trackedOrNull(recipe, projected30.sellablePortions);
      const projectedSellable60m = trackedOrNull(recipe, projected60.sellablePortions);

      let status = product.status;
      if (product.tracked) {
        if (!product.active) {
          status = "paused";
        } else if ((sellableNow ?? 0) <= 0) {
          status = "sold_out";
        } else if (
          (projectedSellable30m ?? Number.MAX_SAFE_INTEGER) <= 0 ||
          (sellableNow ?? Number.MAX_SAFE_INTEGER) <= 5 ||
          (projectedSellable30m ?? Number.MAX_SAFE_INTEGER) <= 5 ||
          (projectedSellable60m ?? Number.MAX_SAFE_INTEGER) <= 5
        ) {
          status = "running_low";
        } else {
          status = "ok";
        }
      }

      return {
        ...product,
        projectedSellable30m,
        projectedSellable60m,
        status,
        suggestedAction: getSuggestedAction({
          tracked: product.tracked,
          active: product.active,
          autoPause: product.autoPause,
          sellableNow,
          projected30m: projectedSellable30m,
        }),
      };
    })
    .sort(
      (left, right) =>
        statusRank(left.status) - statusRank(right.status) ||
        (left.projectedSellable30m ?? Number.MAX_SAFE_INTEGER) -
          (right.projectedSellable30m ?? Number.MAX_SAFE_INTEGER) ||
        left.name.localeCompare(right.name, "it")
    );

  const ingredientInsights: DishRadarIngredientInsight[] = config.ingredients
    .map((ingredient) => {
      const dependentProducts = finalizedProducts.filter((product) =>
        (recipeByProductId.get(product.productId) ?? []).some(
          (recipeItem) => recipeItem.ingredientId === ingredient.id
        )
      );
      const bufferQuantity = Math.max(
        0,
        ...dependentProducts.map((product) => {
          const recipe = recipeByProductId.get(product.productId) ?? [];
          return (
            recipe.find((recipeItem) => recipeItem.ingredientId === ingredient.id)?.quantity ?? 0
          ) * 5;
        })
      );
      const hourlyDemand = forecast60UsageByIngredientId.get(ingredient.id) ?? 0;
      const recommendedBuy = Math.max(
        0,
        roundQuantity(hourlyDemand * 4 + bufferQuantity - ingredient.stock)
      );
      const soldOutLinked = dependentProducts.some(
        (product) => (product.projectedSellable60m ?? Number.MAX_SAFE_INTEGER) <= 0
      );
      const lowLinked = dependentProducts.some(
        (product) => (product.projectedSellable60m ?? Number.MAX_SAFE_INTEGER) <= 5
      );
      const status: DishRadarIngredientInsight["status"] =
        ingredient.stock <= 0 ||
        (projected60StockByIngredientId.get(ingredient.id) ?? ingredient.stock) <= 0 ||
        soldOutLinked
          ? "sold_out"
          : lowLinked
            ? "running_low"
            : "ok";

      return {
        ingredientId: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        stock: ingredient.stock,
        consumedToday: roundQuantity(
          consumedTodayByIngredientId.get(ingredient.id) ?? 0
        ),
        projectedStock30m: roundQuantity(
          projected30StockByIngredientId.get(ingredient.id) ?? ingredient.stock
        ),
        projectedStock60m: roundQuantity(
          projected60StockByIngredientId.get(ingredient.id) ?? ingredient.stock
        ),
        status,
        recommendedBuy,
        linkedProducts: dependentProducts
          .map((product) => {
            const recipe = recipeByProductId.get(product.productId) ?? [];
            const match = recipe.find(
              (recipeItem) => recipeItem.ingredientId === ingredient.id
            );
            if (!match) return null;

            return {
              productId: product.productId,
              name: product.name,
              gramsPerPortion: match.quantity,
            };
          })
          .filter(
            (
              link
            ): link is {
              productId: string;
              name: string;
              gramsPerPortion: number;
            } => link != null
          ),
      };
    })
    .sort(
      (left, right) =>
        statusRank(left.status) - statusRank(right.status) ||
        left.name.localeCompare(right.name, "it")
    );

  return {
    generatedAt: now.toISOString(),
    summary: {
      trackedProducts: finalizedProducts.filter((product) => product.tracked).length,
      criticalProducts: finalizedProducts.filter(
        (product) => product.status === "running_low" || product.status === "sold_out"
      ).length,
      soldOutProducts: finalizedProducts.filter(
        (product) => product.status === "sold_out" || product.status === "paused"
      ).length,
      shoppingItems: ingredientInsights.filter((ingredient) => ingredient.status !== "ok")
        .length,
    },
    products: finalizedProducts,
    ingredients: ingredientInsights,
    config: {
      ingredients: config.ingredients,
      products: toDishRadarConfigRows({
        settings,
        products: productRows,
      }),
      units: DISH_RADAR_UNITS,
    },
  };
}

function trackedOrNull(recipe: DishRadarRecipeItem[], value: number | null) {
  return recipe.length > 0 ? value : null;
}

function statusRank(status: DishRadarStatus | DishRadarIngredientInsight["status"]) {
  if (status === "sold_out") return 0;
  if (status === "paused") return 1;
  if (status === "running_low") return 2;
  if (status === "untracked") return 4;
  return 3;
}
