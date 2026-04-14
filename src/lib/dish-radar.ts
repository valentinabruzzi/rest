import type {
  DishRadarConfigProductRow,
  DishRadarIngredientConfig,
  DishRadarMenuEditorIngredientRow,
  DishRadarProductConfig,
  DishRadarRecipeItem,
  DishRadarUnit,
} from "@/types/staff-availability";

type DishRadarSettingsShape = {
  dishRadar?: unknown;
  [key: string]: unknown;
};

type RawProduct = {
  id: string;
  name: string;
  active: boolean;
};

export type DishRadarConfig = {
  ingredients: DishRadarIngredientConfig[];
  products: DishRadarProductConfig[];
};

export type DishRadarProductAvailability = {
  tracked: boolean;
  autoPause: boolean;
  sellablePortions: number | null;
  criticalIngredientId: string | null;
  criticalIngredientName: string | null;
  dynamicallyUnavailable: boolean;
};

export class DishRadarAvailabilityError extends Error {}

export const DISH_RADAR_UNITS: DishRadarUnit[] = ["g", "ml", "pcs"];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...value } as Record<string, unknown>)
    : {};
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function ensureUniqueId(baseId: string, usedIds: Set<string>) {
  const safeBase = baseId || "entry";
  let nextId = safeBase;
  let counter = 2;
  while (usedIds.has(nextId)) {
    nextId = `${safeBase}_${counter}`;
    counter += 1;
  }
  usedIds.add(nextId);
  return nextId;
}

function normaliseLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim().replace(/\s+/g, " ");
  return next.length >= 2 ? next.slice(0, 80) : null;
}

function normaliseLookupKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normaliseNumber(value: unknown, fallback: number = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value * 100) / 100);
}

function normaliseUnit(value: unknown): DishRadarUnit {
  return DISH_RADAR_UNITS.includes(value as DishRadarUnit)
    ? (value as DishRadarUnit)
    : "pcs";
}

function normaliseRecipe(recipe: unknown): DishRadarRecipeItem[] {
  if (!Array.isArray(recipe)) return [];

  return recipe
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      const ingredientId =
        typeof row.ingredientId === "string" ? row.ingredientId.trim() : "";
      if (!ingredientId) return null;

      const quantity = normaliseNumber(row.quantity, 0);
      if (quantity <= 0) return null;

      return {
        ingredientId,
        quantity,
      } satisfies DishRadarRecipeItem;
    })
    .filter((entry): entry is DishRadarRecipeItem => entry != null);
}

export function getRestaurantDishRadarConfig(settings: unknown): DishRadarConfig {
  const settingsObject = asObject(settings) as DishRadarSettingsShape;
  const dishRadarObject = asObject(settingsObject.dishRadar);

  const usedIngredientIds = new Set<string>();
  const ingredients = Array.isArray(dishRadarObject.ingredients)
    ? dishRadarObject.ingredients
        .map((entry, index) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
          const row = entry as Record<string, unknown>;
          const name = normaliseLabel(row.name);
          if (!name) return null;

          const explicitId =
            typeof row.id === "string" && row.id.trim().length > 0
              ? row.id.trim()
              : slugify(name);

          return {
            id: ensureUniqueId(explicitId, usedIngredientIds),
            name,
            unit: normaliseUnit(row.unit),
            stock: normaliseNumber(row.stock, 0),
            sortOrder:
              typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder)
                ? row.sortOrder
                : index,
          } satisfies DishRadarIngredientConfig;
        })
        .filter((entry): entry is DishRadarIngredientConfig => entry != null)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "it"))
    : [];

  const usedProductIds = new Set<string>();
  const products = Array.isArray(dishRadarObject.products)
    ? dishRadarObject.products
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
          const row = entry as Record<string, unknown>;
          const productId =
            typeof row.productId === "string" ? row.productId.trim() : "";
          if (!productId || usedProductIds.has(productId)) return null;

          usedProductIds.add(productId);

          return {
            productId,
            autoPause: typeof row.autoPause === "boolean" ? row.autoPause : true,
            recipe: normaliseRecipe(row.recipe),
          } satisfies DishRadarProductConfig;
        })
        .filter((entry): entry is DishRadarProductConfig => entry != null)
    : [];

  return {
    ingredients,
    products,
  };
}

export function setRestaurantDishRadarConfig(
  settings: unknown,
  config: DishRadarConfig
) {
  const settingsObject = asObject(settings) as DishRadarSettingsShape;
  settingsObject.dishRadar = {
    ingredients: config.ingredients.map((ingredient, index) => ({
      id: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      stock: normaliseNumber(ingredient.stock, 0),
      sortOrder: index,
    })),
    products: config.products.map((product) => ({
      productId: product.productId,
      autoPause: product.autoPause,
      recipe: product.recipe
        .filter((item) => item.ingredientId.trim().length > 0 && item.quantity > 0)
        .map((item) => ({
          ingredientId: item.ingredientId,
          quantity: normaliseNumber(item.quantity, 0),
        })),
    })),
  };
  return settingsObject;
}

export function buildDishRadarIngredientId(
  name: string,
  existingIngredients: DishRadarIngredientConfig[]
) {
  const usedIds = new Set(existingIngredients.map((ingredient) => ingredient.id));
  return ensureUniqueId(slugify(name) || "ingredient", usedIds);
}

function getIngredientMap(config: DishRadarConfig) {
  return new Map(config.ingredients.map((ingredient) => [ingredient.id, ingredient]));
}

export function getDishRadarProductConfig(
  config: DishRadarConfig,
  productId: string
): DishRadarProductConfig | null {
  return config.products.find((product) => product.productId === productId) ?? null;
}

export function getDishRadarMenuEditorIngredients(args: {
  settings?: unknown;
  config?: DishRadarConfig;
  productId: string;
}): DishRadarMenuEditorIngredientRow[] {
  const config =
    args.config ?? getRestaurantDishRadarConfig(args.settings);
  const ingredientMap = getIngredientMap(config);
  const recipe = getDishRadarProductConfig(config, args.productId)?.recipe ?? [];

  return recipe.reduce<DishRadarMenuEditorIngredientRow[]>((rows, item) => {
      const ingredient = ingredientMap.get(item.ingredientId);
      if (!ingredient) return rows;

      rows.push({
        ingredientId: ingredient.id,
        name: ingredient.name,
        quantity: item.quantity,
      });

      return rows;
    }, []);
}

export function upsertDishRadarProductRecipe(args: {
  settings: unknown;
  productId: string;
  ingredients: DishRadarMenuEditorIngredientRow[];
}) {
  const config = getRestaurantDishRadarConfig(args.settings);
  const nextIngredients = config.ingredients.map((ingredient) => ({ ...ingredient }));
  const currentProductConfig = getDishRadarProductConfig(config, args.productId);
  const ingredientById = new Map(
    nextIngredients.map((ingredient) => [ingredient.id, ingredient])
  );
  const ingredientIdByName = new Map(
    nextIngredients.map((ingredient) => [normaliseLookupKey(ingredient.name), ingredient.id])
  );
  const recipeByIngredientId = new Map<string, number>();

  for (const row of args.ingredients) {
    const name = normaliseLabel(row.name);
    const quantity = normaliseNumber(row.quantity, 0);
    if (!name || quantity <= 0) continue;

    let ingredient =
      (row.ingredientId ? ingredientById.get(row.ingredientId) : undefined) ??
      ingredientById.get(ingredientIdByName.get(normaliseLookupKey(name)) ?? "");

    if (!ingredient) {
      ingredient = {
        id: buildDishRadarIngredientId(name, nextIngredients),
        name,
        unit: "g",
        stock: 0,
        sortOrder: nextIngredients.length,
      };
      nextIngredients.push(ingredient);
      ingredientById.set(ingredient.id, ingredient);
      ingredientIdByName.set(normaliseLookupKey(name), ingredient.id);
    } else {
      ingredient.name = name;
      ingredient.unit = "g";
    }

    recipeByIngredientId.set(
      ingredient.id,
      roundRecipeQuantity((recipeByIngredientId.get(ingredient.id) ?? 0) + quantity)
    );
  }

  const nextProducts = config.products.filter(
    (product) => product.productId !== args.productId
  );
  const nextRecipe = [...recipeByIngredientId.entries()]
    .map(([ingredientId, quantity]) => ({
      ingredientId,
      quantity,
    }))
    .filter((item) => item.quantity > 0);

  if (nextRecipe.length > 0) {
    nextProducts.push({
      productId: args.productId,
      autoPause: currentProductConfig?.autoPause ?? true,
      recipe: nextRecipe,
    });
  }

  const nextConfig: DishRadarConfig = {
    ingredients: nextIngredients,
    products: nextProducts,
  };

  return {
    config: nextConfig,
    settings: setRestaurantDishRadarConfig(args.settings, nextConfig),
  };
}

function roundRecipeQuantity(value: number) {
  return Math.round(value * 100) / 100;
}

export function getDishRadarAvailabilityMap(args: {
  settings: unknown;
  products: RawProduct[];
}) {
  const config = getRestaurantDishRadarConfig(args.settings);
  const ingredientMap = getIngredientMap(config);
  const availability = new Map<string, DishRadarProductAvailability>();

  for (const product of args.products) {
    const configEntry = getDishRadarProductConfig(config, product.id);
    const recipe = configEntry?.recipe ?? [];

    if (!configEntry || recipe.length === 0) {
      availability.set(product.id, {
        tracked: false,
        autoPause: Boolean(configEntry?.autoPause),
        sellablePortions: null,
        criticalIngredientId: null,
        criticalIngredientName: null,
        dynamicallyUnavailable: false,
      });
      continue;
    }

    let sellablePortions = Number.POSITIVE_INFINITY;
    let criticalIngredientId: string | null = null;
    let criticalIngredientName: string | null = null;

    for (const item of recipe) {
      const ingredient = ingredientMap.get(item.ingredientId);
      const portionsFromIngredient =
        ingredient && item.quantity > 0
          ? Math.floor(ingredient.stock / item.quantity)
          : 0;

      if (portionsFromIngredient < sellablePortions) {
        sellablePortions = portionsFromIngredient;
        criticalIngredientId = item.ingredientId;
        criticalIngredientName = ingredient?.name ?? null;
      }
    }

    const normalizedSellable = Number.isFinite(sellablePortions)
      ? Math.max(0, sellablePortions)
      : 0;

    availability.set(product.id, {
      tracked: true,
      autoPause: configEntry.autoPause,
      sellablePortions: normalizedSellable,
      criticalIngredientId,
      criticalIngredientName,
      dynamicallyUnavailable:
        product.active && configEntry.autoPause && normalizedSellable <= 0,
    });
  }

  return availability;
}

export function getDishRadarDynamicUnavailableIds(args: {
  settings: unknown;
  products: RawProduct[];
}) {
  const availability = getDishRadarAvailabilityMap(args);
  return new Set(
    args.products
      .filter((product) => availability.get(product.id)?.dynamicallyUnavailable)
      .map((product) => product.id)
  );
}

export function consumeDishRadarInventory(args: {
  settings: unknown;
  products: RawProduct[];
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}) {
  const config = getRestaurantDishRadarConfig(args.settings);
  const ingredientMap = new Map(
    config.ingredients.map((ingredient) => [ingredient.id, { ...ingredient }])
  );
  const productMap = new Map(args.products.map((product) => [product.id, product]));
  const consumption = new Map<string, number>();

  for (const line of args.items) {
    const product = productMap.get(line.productId);
    const configEntry = getDishRadarProductConfig(config, line.productId);
    const recipe = configEntry?.recipe ?? [];

    if (!product || !configEntry || recipe.length === 0) continue;

    const availability = getDishRadarAvailabilityMap({
      settings: setRestaurantDishRadarConfig({}, config),
      products: [product],
    }).get(product.id);

    if (
      availability?.sellablePortions != null &&
      line.quantity > availability.sellablePortions
    ) {
      throw new DishRadarAvailabilityError(
        `Only ${availability.sellablePortions} portion${
          availability.sellablePortions === 1 ? "" : "s"
        } left for ${product.name}.`
      );
    }

    for (const recipeItem of recipe) {
      consumption.set(
        recipeItem.ingredientId,
        (consumption.get(recipeItem.ingredientId) ?? 0) +
          recipeItem.quantity * line.quantity
      );
    }
  }

  if (consumption.size === 0) {
    return {
      changed: false,
      settings: args.settings,
      config,
    };
  }

  for (const [ingredientId, quantity] of consumption.entries()) {
    const ingredient = ingredientMap.get(ingredientId);
    if (!ingredient) {
      throw new DishRadarAvailabilityError(
        "Dish Radar configuration is missing an ingredient required by the recipe."
      );
    }

    if (ingredient.stock < quantity) {
      throw new DishRadarAvailabilityError(
        `${ingredient.name} is out of stock for the incoming order.`
      );
    }
  }

  const nextConfig: DishRadarConfig = {
    ingredients: config.ingredients.map((ingredient) => ({
      ...ingredient,
      stock: normaliseNumber(
        ingredient.stock - (consumption.get(ingredient.id) ?? 0),
        0
      ),
    })),
    products: config.products,
  };

  return {
    changed: true,
    settings: setRestaurantDishRadarConfig(args.settings, nextConfig),
    config: nextConfig,
  };
}

export function toDishRadarConfigRows(args: {
  settings: unknown;
  products: RawProduct[];
}): DishRadarConfigProductRow[] {
  const config = getRestaurantDishRadarConfig(args.settings);
  const configByProductId = new Map(
    config.products.map((product) => [product.productId, product])
  );

  return args.products.map((product) => ({
    productId: product.id,
    name: product.name,
    active: product.active,
    autoPause: configByProductId.get(product.id)?.autoPause ?? true,
    recipe: configByProductId.get(product.id)?.recipe ?? [],
  }));
}
