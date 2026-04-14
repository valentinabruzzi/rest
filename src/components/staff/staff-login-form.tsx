"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getRestaurantBranding,
  getRestaurantFontFamily,
  getRestaurantInterfaceSettings,
  RESTAURANT_LANGUAGE_OPTIONS,
  type RestaurantLanguageCode,
} from "@/lib/restaurant-branding";
import {
  createRestaurantIdentityKey,
  formatRestaurantNameFromSlug,
  normalizeRestaurantNameInput,
  normalizeRestaurantSlugInput,
  type StaffLoginRestaurantOption,
} from "@/lib/restaurant-directory";
import { recordRuntimeMetric } from "@/lib/runtime-metrics";
import {
  fetchJsonWithRetry,
  getRuntimeCircuitKey,
  getRuntimeCircuitMode,
  recordRuntimeCircuitFailure,
  recordRuntimeCircuitSuccess,
} from "@/lib/runtime-resilience";

type RestaurantOption = StaffLoginRestaurantOption & {
  theme?: unknown | null;
  settings?: unknown | null;
};

const LOGIN_COPY = {
  it: {
    title: "Login staff",
    language: "Lingua",
    restaurant: "Locale",
    restaurantName: "Nome locale",
    selectRestaurant: "Seleziona un locale",
    password: "Password staff",
    passwordHint: "Usa la password staff del locale. Il PIN del ruolo si inserisce dopo.",
    continue: "Continua",
    back: "Indietro",
    loginFailed: "Accesso non riuscito",
    networkError: "Errore di rete",
    invalidCredentials: "Credenziali non valide",
    restaurantRequired: "Locale obbligatorio",
    restaurantNotFound: "Locale non trovato",
    notConfigured: "Login staff non configurato",
    temporarilyUnavailable: "Login staff temporaneamente non disponibile",
    restaurantNameRequiredForSlug:
      "Per questo slug serve anche il nome esatto del locale.",
    restaurantSlug: "Slug locale",
    restaurantNamePlaceholder: "Bar Mazzini",
    restaurantSlugPlaceholder: "bar-roma",
    restaurantListFallback:
      "Elenco locali non disponibile ora. Inserisci lo slug del locale.",
  },
  en: {
    title: "Staff login",
    language: "Language",
    restaurant: "Restaurant",
    restaurantName: "Restaurant name",
    selectRestaurant: "Select a venue",
    password: "Staff password",
    passwordHint: "Use the venue staff password. The role PIN comes after login.",
    continue: "Continue",
    back: "Back",
    loginFailed: "Login failed",
    networkError: "Network error",
    invalidCredentials: "Invalid credentials",
    restaurantRequired: "Restaurant is required",
    restaurantNotFound: "Restaurant not found",
    notConfigured: "Staff login is not configured",
    temporarilyUnavailable: "Staff login is temporarily unavailable",
    restaurantNameRequiredForSlug:
      "This slug needs the exact restaurant name too.",
    restaurantSlug: "Venue slug",
    restaurantNamePlaceholder: "Bar Mazzini",
    restaurantSlugPlaceholder: "bar-roma",
    restaurantListFallback:
      "Venue list is not available right now. Enter the venue slug.",
  },
} as const;

const STAFF_LOGIN_RESTAURANTS_CACHE_KEY = "bb_staff_login_restaurants_v1";
const STAFF_LOGIN_LAST_RESTAURANT_KEY = "bb_staff_login_last_restaurant_v1";
const STAFF_LOGIN_LAST_SLUG_KEY = "bb_staff_login_last_slug_v1";
const ADMIN_RESTAURANTS_CACHE_KEY = "bb_admin_restaurants_cache_v1";
const STAFF_ROLE_SESSION_KEY = "bb_staff_role_session_v2";

function sanitizeRestaurants(value: unknown): RestaurantOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .map<RestaurantOption | null>((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const restaurant = entry as Record<string, unknown>;
      const id =
        typeof restaurant.id === "string" && restaurant.id.trim().length > 0
          ? restaurant.id.trim()
          : null;
      const name =
        typeof restaurant.name === "string" && restaurant.name.trim().length > 0
          ? restaurant.name.trim()
          : null;
      const slug =
        typeof restaurant.slug === "string" && restaurant.slug.trim().length > 0
          ? restaurant.slug.trim()
          : null;

      if (!id || !name || !slug) return null;

      return {
        id,
        name,
        slug,
        logoUrl: typeof restaurant.logoUrl === "string" ? restaurant.logoUrl : null,
        primaryColor:
          typeof restaurant.primaryColor === "string" &&
          restaurant.primaryColor.trim().length > 0
            ? restaurant.primaryColor
            : "#6E0F1F",
        secondaryColor:
          typeof restaurant.secondaryColor === "string" &&
          restaurant.secondaryColor.trim().length > 0
            ? restaurant.secondaryColor
            : "#4E0915",
        theme:
          "theme" in restaurant ? (restaurant.theme as RestaurantOption["theme"]) : null,
        settings:
          "settings" in restaurant
            ? (restaurant.settings as RestaurantOption["settings"])
            : null,
      };
    })
    .filter((entry): entry is RestaurantOption => entry !== null);
}

function readCachedRestaurants(): RestaurantOption[] {
  if (typeof window === "undefined") return [];

  try {
    const cachedStaffRestaurants = sanitizeRestaurants(
      JSON.parse(window.localStorage.getItem(STAFF_LOGIN_RESTAURANTS_CACHE_KEY) ?? "[]")
    );
    const cachedAdminRestaurants = sanitizeRestaurants(
      JSON.parse(window.localStorage.getItem(ADMIN_RESTAURANTS_CACHE_KEY) ?? "[]")
    );

    const merged = [...cachedStaffRestaurants];
    for (const restaurant of cachedAdminRestaurants) {
      if (
        merged.some(
          (entry) =>
            entry.id === restaurant.id ||
            createRestaurantIdentityKey({
              name: entry.name,
              slug: entry.slug,
            }) ===
              createRestaurantIdentityKey({
                name: restaurant.name,
                slug: restaurant.slug,
              })
        )
      ) {
        continue;
      }
      merged.push(restaurant);
    }

    return merged;
  } catch {
    return [];
  }
}

function readFallbackRestaurantIdentity(): {
  restaurantSlug: string;
  restaurantName: string;
} {
  if (typeof window === "undefined") {
    return { restaurantSlug: "", restaurantName: "" };
  }

  try {
    const storedIdentity = window.localStorage.getItem(
      STAFF_LOGIN_LAST_RESTAURANT_KEY
    );
    if (storedIdentity) {
      const parsed = JSON.parse(storedIdentity) as {
        restaurantSlug?: unknown;
        restaurantName?: unknown;
      };
      const restaurantSlug =
        typeof parsed.restaurantSlug === "string"
          ? parsed.restaurantSlug.trim()
          : "";
      const restaurantName =
        typeof parsed.restaurantName === "string"
          ? parsed.restaurantName.trim()
          : "";

      if (restaurantSlug) {
        return { restaurantSlug, restaurantName };
      }
    }
  } catch {
    /* ignore invalid storage */
  }

  const loginSlug = window.localStorage.getItem(STAFF_LOGIN_LAST_SLUG_KEY)?.trim();
  if (loginSlug) return { restaurantSlug: loginSlug, restaurantName: "" };

  try {
    const rawRoleSession = window.localStorage.getItem(STAFF_ROLE_SESSION_KEY);
    if (!rawRoleSession) return { restaurantSlug: "", restaurantName: "" };
    const parsed = JSON.parse(rawRoleSession) as {
      restaurantSlug?: unknown;
      restaurantName?: unknown;
    };
    return {
      restaurantSlug:
        typeof parsed.restaurantSlug === "string" ? parsed.restaurantSlug.trim() : "",
      restaurantName:
        typeof parsed.restaurantName === "string" ? parsed.restaurantName.trim() : "",
    };
  } catch {
    return { restaurantSlug: "", restaurantName: "" };
  }
}

function writeCachedRestaurants(restaurants: RestaurantOption[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STAFF_LOGIN_RESTAURANTS_CACHE_KEY,
      JSON.stringify(restaurants)
    );
  } catch {
    /* ignore storage errors */
  }
}

export function StaffLoginForm({
  initialRestaurants = [],
  initialRestaurantSlug,
  initialRestaurantName = "",
  initialRestaurantSelectionKey = "",
}: {
  initialRestaurants?: RestaurantOption[];
  initialRestaurantSlug: string;
  initialRestaurantName?: string;
  initialRestaurantSelectionKey?: string;
}) {
  const router = useRouter();
  const sanitizedInitialRestaurants = useMemo(
    () => sanitizeRestaurants(initialRestaurants),
    [initialRestaurants]
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>(
    sanitizedInitialRestaurants
  );
  const [restaurantsLoading, setRestaurantsLoading] = useState(
    sanitizedInitialRestaurants.length === 0
  );
  const [selectedRestaurantKey, setSelectedRestaurantKey] = useState(
    initialRestaurantSelectionKey
  );
  const [restaurantSlug, setRestaurantSlug] = useState(initialRestaurantSlug);
  const [restaurantName, setRestaurantName] = useState(initialRestaurantName);
  const [language, setLanguage] = useState<RestaurantLanguageCode>("it");
  const restaurantDirectoryMetricsScope = useMemo(
    () => ({ scope: "staff-login" as const }),
    []
  );
  const restaurantListCircuitKey = useMemo(
    () => getRuntimeCircuitKey({ scope: "staff-login-directory" }),
    []
  );
  const loginCircuitKey = useMemo(
    () =>
      getRuntimeCircuitKey({
        scope: "staff-login-submit",
        restaurantName,
        restaurantSlug,
      }),
    [restaurantName, restaurantSlug]
  );
  const selectedRestaurantKeyRef = useRef(selectedRestaurantKey);
  const restaurantSlugRef = useRef(restaurantSlug);
  const restaurantNameRef = useRef(restaurantName);

  useEffect(() => {
    selectedRestaurantKeyRef.current = selectedRestaurantKey;
  }, [selectedRestaurantKey]);

  useEffect(() => {
    restaurantSlugRef.current = restaurantSlug;
  }, [restaurantSlug]);

  useEffect(() => {
    restaurantNameRef.current = restaurantName;
  }, [restaurantName]);

  const selectedRestaurant = useMemo(
    () =>
      restaurants.find(
        (restaurant) =>
          createRestaurantIdentityKey({
            name: restaurant.name,
            slug: restaurant.slug,
          }) === selectedRestaurantKey
      ) ?? null,
    [restaurants, selectedRestaurantKey]
  );
  const branding = useMemo(
    () =>
      getRestaurantBranding(
        selectedRestaurant?.theme ?? null,
        selectedRestaurant?.settings ?? null
      ),
    [selectedRestaurant?.settings, selectedRestaurant?.theme]
  );
  const interfaceSettings = useMemo(
    () => getRestaurantInterfaceSettings(selectedRestaurant?.settings),
    [selectedRestaurant?.settings]
  );
  const currentLanguage =
    language === "en" || interfaceSettings.defaultLanguage === "en" ? language : "it";
  const copy = LOGIN_COPY[currentLanguage === "en" ? "en" : "it"];

  const applyRestaurantSelection = useCallback(
    (nextRestaurants: RestaurantOption[], fallback?: { restaurantSlug?: string; restaurantName?: string }) => {
      const fallbackSlug = fallback?.restaurantSlug?.trim() ?? "";
      const fallbackName = fallback?.restaurantName?.trim() ?? "";
      const currentSelectedRestaurantKey = selectedRestaurantKeyRef.current;
      const currentRestaurantSlug = restaurantSlugRef.current;
      const currentRestaurantName = restaurantNameRef.current;

      const nextSelectedRestaurant =
        nextRestaurants.find(
          (restaurant) =>
            createRestaurantIdentityKey({
              name: restaurant.name,
              slug: restaurant.slug,
            }) === currentSelectedRestaurantKey
        ) ??
        nextRestaurants.find(
          (restaurant) =>
            restaurant.slug === currentRestaurantSlug &&
            (!currentRestaurantName ||
              normalizeRestaurantNameInput(restaurant.name) ===
                normalizeRestaurantNameInput(currentRestaurantName))
        ) ??
        nextRestaurants.find(
          (restaurant) =>
            restaurant.slug === fallbackSlug &&
            (!fallbackName ||
              normalizeRestaurantNameInput(restaurant.name) ===
                normalizeRestaurantNameInput(fallbackName))
        ) ??
        nextRestaurants.find((restaurant) => restaurant.slug === currentRestaurantSlug) ??
        nextRestaurants.find((restaurant) => restaurant.slug === fallbackSlug) ??
        nextRestaurants[0] ??
        null;

      if (!nextSelectedRestaurant) {
        return;
      }

      setSelectedRestaurantKey(
        createRestaurantIdentityKey({
          name: nextSelectedRestaurant.name,
          slug: nextSelectedRestaurant.slug,
        })
      );
      setRestaurantSlug(nextSelectedRestaurant.slug);
      setRestaurantName(nextSelectedRestaurant.name);
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cachedIdentity = readFallbackRestaurantIdentity();
    if (!initialRestaurantSlug && cachedIdentity.restaurantSlug) {
      setRestaurantSlug((current) => current || cachedIdentity.restaurantSlug);
      setRestaurantName((current) => current || cachedIdentity.restaurantName);
    }

    if (initialRestaurants.length > 0) {
      setRestaurants(sanitizedInitialRestaurants);
      setRestaurantsLoading(false);
      writeCachedRestaurants(sanitizedInitialRestaurants);
      applyRestaurantSelection(sanitizedInitialRestaurants, cachedIdentity);
      return;
    }

    const cachedRestaurants = readCachedRestaurants();
    if (cachedRestaurants.length === 0) {
      return;
    }

    setRestaurants(cachedRestaurants);
    setRestaurantsLoading(false);
    applyRestaurantSelection(cachedRestaurants, cachedIdentity);
  }, [
    applyRestaurantSelection,
    initialRestaurantSlug,
    initialRestaurants,
    sanitizedInitialRestaurants,
  ]);

  useEffect(() => {
    if (initialRestaurants.length > 0) {
      setRestaurantsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadRestaurantDirectory() {
      const circuit = getRuntimeCircuitMode(restaurantListCircuitKey);
      if (!circuit.canRequest) {
        setRestaurantsLoading(false);
        return;
      }

      try {
        const result = await fetchJsonWithRetry<{ restaurants?: RestaurantOption[] }>(
          "/api/restaurants",
          undefined,
          { attempts: 3 }
        );
        if (cancelled) return;

        if (!result.ok || !result.data?.restaurants) {
          recordRuntimeMetric(restaurantDirectoryMetricsScope, {
            type: "failure",
            failureClass: result.failureClass,
            retries: Math.max(0, result.attempts - 1),
          });
          const nextCircuit = recordRuntimeCircuitFailure(restaurantListCircuitKey);
          if (nextCircuit.state === "open") {
            recordRuntimeMetric(restaurantDirectoryMetricsScope, {
              type: "breaker_open",
            });
          }
          return;
        }

        recordRuntimeCircuitSuccess(restaurantListCircuitKey);
        recordRuntimeMetric(restaurantDirectoryMetricsScope, {
          type: "success",
          retries: Math.max(0, result.attempts - 1),
        });

        const nextRestaurants = sanitizeRestaurants(result.data.restaurants);
        if (nextRestaurants.length === 0) return;

        setRestaurants(nextRestaurants);
        writeCachedRestaurants(nextRestaurants);
        applyRestaurantSelection(nextRestaurants, readFallbackRestaurantIdentity());
      } catch {
        /* keep manual slug fallback */
      } finally {
        if (!cancelled) {
          setRestaurantsLoading(false);
        }
      }
    }

    void loadRestaurantDirectory();

    return () => {
      cancelled = true;
    };
  }, [applyRestaurantSelection, initialRestaurants, restaurantDirectoryMetricsScope, restaurantListCircuitKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextSlug = selectedRestaurant?.slug ?? restaurantSlug.trim();
    const nextName = selectedRestaurant?.name ?? restaurantName.trim();
    if (!nextSlug) return;
    window.localStorage.setItem(STAFF_LOGIN_LAST_SLUG_KEY, nextSlug);
    window.localStorage.setItem(
      STAFF_LOGIN_LAST_RESTAURANT_KEY,
      JSON.stringify({
        restaurantSlug: nextSlug,
        restaurantName: nextName,
      })
    );
  }, [restaurantName, restaurantSlug, selectedRestaurant]);

  useEffect(() => {
    const storageKey = selectedRestaurant
      ? `bb_staff_login_lang_${selectedRestaurant.id}`
      : null;
    const defaultLanguage =
      interfaceSettings.defaultLanguage === "en" ? "en" : "it";

    if (typeof window === "undefined" || !storageKey) {
      setLanguage(defaultLanguage);
      return;
    }

    const stored = window.localStorage.getItem(storageKey);
    if (
      stored &&
      (stored === "it" || stored === "en") &&
      interfaceSettings.enabledLanguages.includes(stored)
    ) {
      setLanguage(stored);
      return;
    }

    setLanguage(defaultLanguage);
  }, [interfaceSettings.defaultLanguage, interfaceSettings.enabledLanguages, selectedRestaurant]);

  useEffect(() => {
    if (!selectedRestaurant || typeof window === "undefined") return;
    window.localStorage.setItem(`bb_staff_login_lang_${selectedRestaurant.id}`, language);
  }, [language, selectedRestaurant]);

  function mapLoginError(message: string | null | undefined) {
    if (!message) return copy.loginFailed;
    if (message === "Invalid credentials") return copy.invalidCredentials;
    if (message === "Restaurant is required") return copy.restaurantRequired;
    if (message === "Restaurant not found") return copy.restaurantNotFound;
    if (message === "Staff login is not configured") return copy.notConfigured;
    if (message === "Staff login temporarily unavailable") {
      return copy.temporarilyUnavailable;
    }
    if (message === "Restaurant name is required for this slug") {
      return copy.restaurantNameRequiredForSlug;
    }
    return currentLanguage === "en" ? message : copy.loginFailed;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const normalizedRestaurantSlug =
      selectedRestaurant?.slug || normalizeRestaurantSlugInput(restaurantSlug);
    const normalizedRestaurantName =
      selectedRestaurant?.name ||
      normalizeRestaurantNameInput(restaurantName) ||
      formatRestaurantNameFromSlug(normalizedRestaurantSlug);

    if (!normalizedRestaurantSlug) {
      setError(copy.restaurantRequired);
      setLoading(false);
      return;
    }

    try {
      const circuit = getRuntimeCircuitMode(loginCircuitKey);
      const loginAttemptMetricsScope = {
        scope: "staff-login" as const,
        restaurantName: normalizedRestaurantName,
        restaurantSlug: normalizedRestaurantSlug,
      };

      if (!circuit.canRequest) {
        setError(copy.temporarilyUnavailable);
        setLoading(false);
        return;
      }

      const result = await fetchJsonWithRetry<{ error?: string }>(
        "/api/staff/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password,
            restaurantSlug: normalizedRestaurantSlug,
            restaurantName: normalizedRestaurantName,
            restaurantLogoUrl: selectedRestaurant?.logoUrl ?? null,
            restaurantPrimaryColor: selectedRestaurant?.primaryColor ?? "#6E0F1F",
            restaurantSecondaryColor: selectedRestaurant?.secondaryColor ?? "#4E0915",
            restaurantTheme: selectedRestaurant?.theme ?? null,
            restaurantSettings: selectedRestaurant?.settings ?? null,
          }),
        },
        { attempts: 2 }
      );

      if (!result.ok) {
        recordRuntimeMetric(loginAttemptMetricsScope, {
          type: "failure",
          failureClass: result.failureClass,
          retries: Math.max(0, result.attempts - 1),
        });
        const nextCircuit = recordRuntimeCircuitFailure(loginCircuitKey);
        if (nextCircuit.state === "open") {
          recordRuntimeMetric(loginAttemptMetricsScope, { type: "breaker_open" });
        }
        setError(mapLoginError(result.errorMessage ?? result.data?.error));
        setLoading(false);
        return;
      }

      recordRuntimeCircuitSuccess(loginCircuitKey);
      recordRuntimeMetric(loginAttemptMetricsScope, {
        type: "success",
        retries: Math.max(0, result.attempts - 1),
      });

      setRestaurantSlug(normalizedRestaurantSlug);
      setRestaurantName(normalizedRestaurantName);
      if (typeof window !== "undefined") {
        window.location.assign("/staff");
        return;
      }
      router.push("/staff");
      router.refresh();
    } catch {
      setError(copy.networkError);
    }

    setLoading(false);
  }

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6"
      style={{
        fontFamily: getRestaurantFontFamily(branding.fontPreset),
      }}
      data-admin-font-scope="true"
    >
      {selectedRestaurant?.logoUrl ? (
        <div
          className="mb-5 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-hairline bg-white shadow-[var(--shadow-soft)]"
          style={{ borderColor: `${selectedRestaurant.primaryColor}33` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedRestaurant.logoUrl}
            alt={selectedRestaurant.name}
            className="h-full w-full object-cover"
            data-admin-field="logo"
          />
        </div>
      ) : null}
      <h1
        className="mt-2 text-xl font-semibold"
        style={{ color: branding.headingTextColor }}
        data-admin-role="heading"
      >
        {copy.title}
      </h1>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {interfaceSettings.enabledLanguages.filter((value) => value === "it" || value === "en")
          .length > 1 ? (
          <label className="block">
            <span className="text-sm font-medium text-ink">{copy.language}</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as RestaurantLanguageCode)}
              className="mt-2 w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5 text-sm outline-none ring-bordeaux/20 focus:ring-2"
            >
              {interfaceSettings.enabledLanguages
                .filter((value) => value === "it" || value === "en")
                .map((value) => {
                  const option = RESTAURANT_LANGUAGE_OPTIONS.find(
                    (entry) => entry.value === value
                  );
                  return (
                    <option key={value} value={value}>
                      {option?.label ?? value.toUpperCase()}
                    </option>
                  );
                })}
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className="text-sm font-medium text-ink">{copy.restaurant}</span>
          {restaurants.length > 0 ? (
            <select
              value={selectedRestaurantKey}
              onChange={(event) => {
                const nextKey = event.target.value;
                setSelectedRestaurantKey(nextKey);
                const nextRestaurant =
                  restaurants.find(
                    (restaurant) =>
                      createRestaurantIdentityKey({
                        name: restaurant.name,
                        slug: restaurant.slug,
                      }) === nextKey
                  ) ?? null;
                setRestaurantSlug(nextRestaurant?.slug ?? "");
                setRestaurantName(nextRestaurant?.name ?? "");
              }}
              required
              className="mt-2 w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5 text-sm outline-none ring-bordeaux/20 focus:ring-2"
            >
              <option value="">{copy.selectRestaurant}</option>
              {restaurants.map((restaurant) => (
                <option
                  key={restaurant.id}
                  value={createRestaurantIdentityKey({
                    name: restaurant.name,
                    slug: restaurant.slug,
                  })}
                >
                  {restaurant.name} {" - "} {restaurant.slug}
                </option>
              ))}
            </select>
          ) : (
            <div className="mt-2 space-y-2">
              <input
                value={restaurantName}
                onChange={(event) => setRestaurantName(event.target.value)}
                placeholder={copy.restaurantNamePlaceholder}
                className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5 text-sm outline-none ring-bordeaux/20 focus:ring-2"
              />
              <input
                value={restaurantSlug}
                onChange={(event) => setRestaurantSlug(event.target.value)}
                required
                placeholder={copy.restaurantSlugPlaceholder}
                className="w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5 text-sm outline-none ring-bordeaux/20 focus:ring-2"
              />
            </div>
          )}
          {!restaurantsLoading && restaurants.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{copy.restaurantListFallback}</p>
          ) : null}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">{copy.password}</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-2 w-full rounded-[var(--radius-card)] border border-hairline px-3 py-2.5 text-sm outline-none ring-bordeaux/20 focus:ring-2"
          />
          <p className="mt-2 text-xs text-muted">{copy.passwordHint}</p>
        </label>

        {error ? (
          <p className="text-sm text-bordeaux" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            loading ||
            (restaurants.length > 0
              ? !selectedRestaurant
              : !restaurantSlug.trim())
          }
          className="w-full rounded-[var(--radius-card)] py-3 text-sm font-medium text-white disabled:opacity-40"
          style={{
            backgroundColor: selectedRestaurant?.primaryColor ?? "#6E0F1F",
          }}
        >
          {loading ? `${copy.continue}…` : copy.continue}
        </button>
      </form>

      <Link href="/" className="mt-8 text-center text-sm text-muted hover:text-ink">
        {copy.back}
      </Link>
    </main>
  );
}
