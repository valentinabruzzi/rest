"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  DishRadarIngredientInsight,
  StaffAvailabilityPayload,
} from "@/types/staff-availability";

type StaffUiLanguage = "it" | "en";

type Copy = {
  loading: string;
  loadError: string;
  saveError: string;
  invalidStock: string;
  availability: string;
  ingredient: string;
  linkedDishes: string;
  consumedToday: string;
  critical: string;
  low: string;
  ok: string;
  noRows: string;
  remaining: string;
  totalStock: string;
  save: string;
  saving: string;
};

const COPY: Record<StaffUiLanguage, Copy> = {
  it: {
    loading: "Caricamento Radar Piatti…",
    loadError: "Impossibile caricare Radar Piatti.",
    saveError: "Impossibile salvare Radar Piatti.",
    invalidStock: "Inserisci una scorta valida.",
    availability: "Disponibilita",
    ingredient: "Ingrediente",
    linkedDishes: "Piatti collegati",
    consumedToday: "consumati oggi",
    critical: "Critico",
    low: "Basso",
    ok: "OK",
    noRows: "Nessun ingrediente configurato.",
    remaining: "rimasti",
    totalStock: "Scorta totale",
    save: "Salva",
    saving: "Salvataggio…",
  },
  en: {
    loading: "Loading Dish Radar…",
    loadError: "Could not load Dish Radar.",
    saveError: "Could not save Dish Radar.",
    invalidStock: "Enter a valid stock value.",
    availability: "Availability",
    ingredient: "Ingredient",
    linkedDishes: "Linked dishes",
    consumedToday: "used today",
    critical: "Critical",
    low: "Low",
    ok: "OK",
    noRows: "No ingredients configured.",
    remaining: "left",
    totalStock: "Total stock",
    save: "Save",
    saving: "Saving…",
  },
};

function formatAmount(value: number, unit: DishRadarIngredientInsight["unit"]) {
  if (unit === "g" && value >= 1000) {
    return `${Math.round((value / 1000) * 10) / 10} kg`;
  }

  if (unit === "ml" && value >= 1000) {
    return `${Math.round((value / 1000) * 10) / 10} l`;
  }

  return `${Math.round(value * 100) / 100} ${unit}`;
}

function formatStock(ingredient: DishRadarIngredientInsight, copy: Copy) {
  return `${formatAmount(ingredient.stock, ingredient.unit)} ${copy.remaining}`;
}

function statusRank(status: DishRadarIngredientInsight["status"]) {
  if (status === "sold_out") return 0;
  if (status === "running_low") return 1;
  return 2;
}

function getStatusLabel(status: DishRadarIngredientInsight["status"], copy: Copy) {
  if (status === "sold_out") return copy.critical;
  if (status === "running_low") return copy.low;
  return copy.ok;
}

function getStatusClass(status: DishRadarIngredientInsight["status"]) {
  if (status === "sold_out") {
    return "rounded-full bg-bordeaux px-2.5 py-1 text-[11px] font-medium text-white";
  }

  if (status === "running_low") {
    return "rounded-full bg-[#d7d4d1] px-2.5 py-1 text-[11px] font-medium text-ink";
  }

  return "rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800";
}

export function StaffAvailabilityPanel({
  language,
}: {
  language: StaffUiLanguage;
}) {
  const copy = COPY[language];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StaffAvailabilityPayload | null>(null);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const [savingIngredientId, setSavingIngredientId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/staff/availability");
        const payload = await res.json().catch(() => null);

        if (!res.ok || !payload) {
          throw new Error(copy.loadError);
        }

        if (!cancelled) {
          setData(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : copy.loadError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [copy.loadError]);

  useEffect(() => {
    if (!data) return;

    setStockDrafts(
      Object.fromEntries(
        data.config.ingredients.map((ingredient) => [
          ingredient.id,
          String(Math.round(ingredient.stock * 100) / 100),
        ])
      )
    );
  }, [data]);

  const rows = useMemo(
    () =>
      [...(data?.ingredients ?? [])].sort(
        (left, right) =>
          statusRank(left.status) - statusRank(right.status) ||
          left.name.localeCompare(right.name, "it")
      ),
    [data?.ingredients]
  );

  async function saveIngredientStock(ingredientId: string) {
    if (!data) return;

    const ingredientConfig = data.config.ingredients.find(
      (ingredient) => ingredient.id === ingredientId
    );
    if (!ingredientConfig) return;

    const normalizedValue = (stockDrafts[ingredientId] ?? `${ingredientConfig.stock}`)
      .trim()
      .replace(",", ".");
    const nextStock = Number(normalizedValue);

    if (!Number.isFinite(nextStock) || nextStock < 0) {
      setError(copy.invalidStock);
      return;
    }

    setSavingIngredientId(ingredientId);
    setError(null);

    try {
      const res = await fetch("/api/staff/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: data.config.ingredients.map((ingredient) =>
            ingredient.id === ingredientId
              ? { ...ingredient, stock: nextStock }
              : ingredient
          ),
          products: data.config.products,
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload) {
        throw new Error(copy.saveError);
      }

      setData(payload);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : copy.saveError);
    } finally {
      setSavingIngredientId(null);
    }
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-xl border border-hairline bg-white px-3 py-2.5 shadow-sm">
        <p className="text-sm text-muted">{copy.loading}</p>
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-hairline bg-white shadow-sm">
      {error ? <p className="border-b border-hairline px-3 py-2.5 text-sm text-bordeaux">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-canvas">
            <tr className="text-left text-[11px] uppercase tracking-[0.16em] text-muted">
              <th className="px-3 py-2.5 font-medium">{copy.availability}</th>
              <th className="px-3 py-2.5 font-medium">{copy.ingredient}</th>
              <th className="px-3 py-2.5 font-medium">{copy.linkedDishes}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-5 text-sm text-muted">
                  {copy.noRows}
                </td>
              </tr>
            ) : (
              rows.map((ingredient) => (
                <tr key={ingredient.ingredientId} className="border-t border-hairline align-top">
                  <td className="px-3 py-2.5">
                    <span className={getStatusClass(ingredient.status)}>
                      {getStatusLabel(ingredient.status, copy)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-ink">
                      {ingredient.name} — {formatStock(ingredient, copy)}
                    </p>
                    {ingredient.consumedToday > 0 ? (
                      <p className="mt-0.5 text-xs text-muted">
                        {formatAmount(ingredient.consumedToday, ingredient.unit)} {copy.consumedToday}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted">{copy.totalStock}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={stockDrafts[ingredient.ingredientId] ?? `${ingredient.stock}`}
                        onChange={(event) =>
                          setStockDrafts((current) => ({
                            ...current,
                            [ingredient.ingredientId]: event.target.value,
                          }))
                        }
                        className="w-24 rounded-md border border-hairline bg-canvas px-2 py-1 text-xs text-ink outline-none ring-bordeaux/20 focus:ring-2"
                      />
                      <span className="text-muted">{ingredient.unit}</span>
                      <button
                        type="button"
                        onClick={() => saveIngredientStock(ingredient.ingredientId)}
                        disabled={savingIngredientId === ingredient.ingredientId}
                        className="rounded-full border border-hairline bg-white px-2.5 py-1 text-[11px] font-medium text-ink disabled:opacity-40"
                      >
                        {savingIngredientId === ingredient.ingredientId ? copy.saving : copy.save}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-sm text-muted">
                    {ingredient.linkedProducts.length > 0
                      ? ingredient.linkedProducts
                          .slice()
                          .sort((left, right) => left.name.localeCompare(right.name, "it"))
                          .map(
                            (product) =>
                              `${product.name} (${Math.round(product.gramsPerPortion * 100) / 100} g)`
                          )
                          .join(" · ")
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
