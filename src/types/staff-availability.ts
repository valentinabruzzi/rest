export type DishRadarUnit = "g" | "ml" | "pcs";

export type DishRadarIngredientConfig = {
  id: string;
  name: string;
  unit: DishRadarUnit;
  stock: number;
  sortOrder: number;
};

export type DishRadarRecipeItem = {
  ingredientId: string;
  quantity: number;
};

export type DishRadarMenuEditorIngredientRow = {
  ingredientId: string | null;
  name: string;
  quantity: number;
};

export type DishRadarProductConfig = {
  productId: string;
  autoPause: boolean;
  recipe: DishRadarRecipeItem[];
};

export type DishRadarStatus =
  | "ok"
  | "running_low"
  | "sold_out"
  | "paused"
  | "untracked";

export type DishRadarSuggestedAction =
  | "ok"
  | "track_recipe"
  | "mark_running_low"
  | "watch_30m"
  | "stop_now"
  | "restore";

export type DishRadarProductInsight = {
  productId: string;
  name: string;
  active: boolean;
  tracked: boolean;
  autoPause: boolean;
  sellableNow: number | null;
  projectedSellable30m: number | null;
  projectedSellable60m: number | null;
  forecast30m: number;
  forecast60m: number;
  status: DishRadarStatus;
  criticalIngredientId: string | null;
  criticalIngredientName: string | null;
  suggestedAction: DishRadarSuggestedAction;
};

export type DishRadarIngredientInsight = {
  ingredientId: string;
  name: string;
  unit: DishRadarUnit;
  stock: number;
  consumedToday: number;
  projectedStock30m: number;
  projectedStock60m: number;
  status: Exclude<DishRadarStatus, "paused" | "untracked">;
  recommendedBuy: number;
  linkedProducts: Array<{
    productId: string;
    name: string;
    gramsPerPortion: number;
  }>;
};

export type DishRadarSummary = {
  trackedProducts: number;
  criticalProducts: number;
  soldOutProducts: number;
  shoppingItems: number;
};

export type DishRadarConfigProductRow = {
  productId: string;
  name: string;
  active: boolean;
  autoPause: boolean;
  recipe: DishRadarRecipeItem[];
};

export type DishRadarConfigPayload = {
  ingredients: DishRadarIngredientConfig[];
  products: DishRadarConfigProductRow[];
  units: DishRadarUnit[];
};

export type StaffAvailabilityPayload = {
  generatedAt: string;
  summary: DishRadarSummary;
  products: DishRadarProductInsight[];
  ingredients: DishRadarIngredientInsight[];
  config: DishRadarConfigPayload;
};
