import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  formatRestaurantNameFromSlug,
  normalizeRestaurantNameInput,
} from "@/lib/restaurant-directory";
import { readSessionToken, verifySessionToken } from "@/lib/session-token";

export type StaffSession = {
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  restaurantLogoUrl: string | null;
  restaurantPrimaryColor: string;
  restaurantSecondaryColor: string;
  restaurantTheme: unknown | null;
  restaurantSettings: unknown | null;
  devBypass: boolean;
};

const STAFF_SESSION_RESTAURANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  logoUrl: true,
  primaryColor: true,
  secondaryColor: true,
  theme: true,
  settings: true,
} as const;

function buildSessionFromTokenFallback(args: {
  parsed: ReturnType<typeof readSessionToken>;
  devBypass: boolean;
}): StaffSession | null {
  const { parsed, devBypass } = args;
  if (!parsed?.restaurantSlug) return null;

  return {
    restaurantId: parsed.restaurantId ?? parsed.restaurantSlug,
    restaurantSlug: parsed.restaurantSlug,
    restaurantName:
      parsed.restaurantName ?? formatRestaurantNameFromSlug(parsed.restaurantSlug),
    restaurantLogoUrl: parsed.restaurantLogoUrl ?? null,
    restaurantPrimaryColor: parsed.restaurantPrimaryColor ?? "#6E0F1F",
    restaurantSecondaryColor: parsed.restaurantSecondaryColor ?? "#4E0915",
    restaurantTheme: parsed.restaurantTheme ?? null,
    restaurantSettings: parsed.restaurantSettings ?? null,
    devBypass,
  };
}

async function getDevBypassRestaurant(): Promise<StaffSession | null> {
  try {
    const preferredSlug = process.env.STAFF_DEV_RESTAURANT_SLUG?.trim() || null;
    const restaurant = await prisma.restaurant.findFirst({
      where: preferredSlug
        ? { slug: preferredSlug, active: true }
        : { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        theme: true,
        settings: true,
      },
    });

    if (!restaurant) return null;

    return {
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      restaurantName: restaurant.name,
      restaurantLogoUrl: restaurant.logoUrl,
      restaurantPrimaryColor: restaurant.primaryColor,
      restaurantSecondaryColor: restaurant.secondaryColor,
      restaurantTheme: restaurant.theme,
      restaurantSettings: restaurant.settings,
      devBypass: true,
    };
  } catch {
    return null;
  }
}

async function findRestaurantForSession(parsed: {
  restaurantId?: string | null;
  restaurantSlug?: string | null;
  restaurantName?: string | null;
}) {
  const slug = parsed.restaurantSlug?.trim() ?? "";
  if (!slug) return null;

  const restaurantById =
    parsed.restaurantId?.trim()
      ? await prisma.restaurant.findFirst({
          where: {
            id: parsed.restaurantId.trim(),
            slug,
            active: true,
          },
          select: STAFF_SESSION_RESTAURANT_SELECT,
        })
      : null;

  if (restaurantById) {
    return restaurantById;
  }

  const restaurantsBySlug = await prisma.restaurant.findMany({
    where: {
      slug,
      active: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: STAFF_SESSION_RESTAURANT_SELECT,
  });

  if (restaurantsBySlug.length === 0) {
    return null;
  }

  const normalizedRestaurantName = normalizeRestaurantNameInput(
    parsed.restaurantName ?? ""
  );
  if (normalizedRestaurantName) {
    const restaurantByName =
      restaurantsBySlug.find(
        (restaurant) =>
          normalizeRestaurantNameInput(restaurant.name) === normalizedRestaurantName
      ) ?? null;
    if (restaurantByName) {
      return restaurantByName;
    }
  }

  if (restaurantsBySlug.length === 1) {
    return restaurantsBySlug[0];
  }

  return null;
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const c = await cookies();
  const parsed = readSessionToken(
    c.get("staff_session")?.value,
    process.env.STAFF_SESSION_SECRET,
    "staff"
  );

  if (!parsed?.restaurantId || !parsed.restaurantSlug) {
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.STAFF_DEV_BYPASS === "true"
    ) {
      return getDevBypassRestaurant();
    }

    return null;
  }

  try {
    const restaurant = await findRestaurantForSession(parsed);

    if (!restaurant) {
      return buildSessionFromTokenFallback({ parsed, devBypass: false });
    }

    return {
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      restaurantName: restaurant.name,
      restaurantLogoUrl: restaurant.logoUrl,
      restaurantPrimaryColor: restaurant.primaryColor,
      restaurantSecondaryColor: restaurant.secondaryColor,
      restaurantTheme: restaurant.theme,
      restaurantSettings: restaurant.settings,
      devBypass: false,
    };
  } catch {
    return buildSessionFromTokenFallback({ parsed, devBypass: true });
  }
}

export async function getStaffAuthorized(): Promise<boolean> {
  return (await getStaffSession()) !== null;
}

export async function getAdminAuthorized(): Promise<boolean> {
  const c = await cookies();
  const secret =
    process.env.ADMIN_SESSION_SECRET ?? process.env.STAFF_SESSION_SECRET;
  return verifySessionToken(c.get("admin_session")?.value, secret, "admin");
}
