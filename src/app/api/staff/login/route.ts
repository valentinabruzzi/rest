import { NextRequest, NextResponse } from "next/server";
import { createSessionToken } from "@/lib/session-token";
import { jsonError } from "@/lib/api-errors";
import { isPrismaTemporarilyUnavailable } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import {
  createRestaurantIdentityKey,
  formatRestaurantNameFromSlug,
  normalizeRestaurantNameInput,
  normalizeRestaurantSlugInput,
} from "@/lib/restaurant-directory";
import { resolveRestaurantIdentity } from "@/lib/restaurant-resolver";
import { getRestaurantStaffAccess } from "@/lib/staff-access";

const STAFF_FALLBACK_PASSWORDS: Record<string, string> = {
  "bar-roma": "ROMA",
  "bistrot-bordeaux": "BORD",
};

const STAFF_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export async function POST(req: NextRequest) {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) {
    return jsonError("Staff login is not configured", 500);
  }

  let body: {
    password?: string;
    restaurantSlug?: string;
    restaurantName?: string;
    restaurantLogoUrl?: string | null;
    restaurantPrimaryColor?: string | null;
    restaurantSecondaryColor?: string | null;
    restaurantTheme?: unknown | null;
    restaurantSettings?: unknown | null;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid body", 400);
  }

  const restaurantSlug = normalizeRestaurantSlugInput(body.restaurantSlug ?? "");
  const restaurantName = normalizeRestaurantNameInput(body.restaurantName ?? "");
  if (!restaurantSlug) {
    return jsonError("Restaurant is required", 400);
  }

  const password = body.password ?? "";
  const normalizedPassword = password.trim().toUpperCase();
  const envFallbackPassword = process.env.STAFF_PASSWORD;
  const allowDevelopmentFallback =
    process.env.NODE_ENV !== "production" && password.trim().length > 0;

  try {
    const resolvedRestaurant = await resolveRestaurantIdentity({
      slug: restaurantSlug,
      name: restaurantName,
      activeOnly: true,
    });

    if (resolvedRestaurant.status === "ambiguous") {
      return jsonError("Restaurant name is required for this slug", 409);
    }

    if (resolvedRestaurant.status !== "ok") {
      return jsonError("Restaurant not found", 404);
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: {
        id: resolvedRestaurant.restaurant.id,
      },
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        theme: true,
        settings: true,
        staffUsers: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            passwordHash: true,
          },
        },
      },
    });

    if (!restaurant) {
      return jsonError("Restaurant not found", 404);
    }

    const matchedUser = restaurant.staffUsers.find((staffUser) =>
      verifyPassword(password, staffUser.passwordHash)
    );
    const rolePinFallbackMatch =
      process.env.NODE_ENV !== "production" &&
      Object.values(getRestaurantStaffAccess(restaurant.settings).rolePins).some(
        (pins) => pins.includes(password.trim())
      );
    const restaurantFallbackPassword = STAFF_FALLBACK_PASSWORDS[restaurant.slug];
    const restaurantFallbackMatch =
      !!restaurantFallbackPassword &&
      normalizedPassword === restaurantFallbackPassword;
    const envFallbackMatch =
      restaurant.staffUsers.length === 0 &&
      !!envFallbackPassword &&
      password === envFallbackPassword;

    if (
      !matchedUser &&
      !rolePinFallbackMatch &&
      !restaurantFallbackMatch &&
      !envFallbackMatch
    ) {
      return jsonError("Invalid credentials", 401);
    }

    const token = createSessionToken(
      "staff",
      secret,
      {
        restaurantId: restaurant.id,
        restaurantSlug: restaurant.slug,
        restaurantName: restaurant.name,
        restaurantLogoUrl: restaurant.logoUrl,
        restaurantPrimaryColor: restaurant.primaryColor,
        restaurantSecondaryColor: restaurant.secondaryColor,
      },
      STAFF_SESSION_MAX_AGE_SECONDS * 1000
    );
    const res = NextResponse.json({ ok: true });
    res.cookies.set("staff_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
    });
    return res;
  } catch (error) {
    if (!isPrismaTemporarilyUnavailable(error)) {
      console.error(error);
      return jsonError("Staff login temporarily unavailable", 503);
    }

    const restaurantFallbackPassword = STAFF_FALLBACK_PASSWORDS[restaurantSlug];
    const restaurantFallbackMatch =
      !!restaurantFallbackPassword &&
      normalizedPassword === restaurantFallbackPassword;
    const envFallbackMatch =
      !!envFallbackPassword && password === envFallbackPassword;
    const canUseOfflineFallback =
      restaurantFallbackMatch || envFallbackMatch || allowDevelopmentFallback;

    if (!canUseOfflineFallback) {
      return jsonError("Staff login temporarily unavailable", 503);
    }

    const fallbackRestaurantName =
      restaurantName || formatRestaurantNameFromSlug(restaurantSlug);
    const token = createSessionToken(
      "staff",
      secret,
      {
        restaurantId: `offline:${createRestaurantIdentityKey({
          name: fallbackRestaurantName,
          slug: restaurantSlug,
        })}`,
        restaurantSlug,
        restaurantName: fallbackRestaurantName,
        restaurantLogoUrl:
          typeof body.restaurantLogoUrl === "string" ? body.restaurantLogoUrl : null,
        restaurantPrimaryColor:
          typeof body.restaurantPrimaryColor === "string" &&
          body.restaurantPrimaryColor.trim().length > 0
            ? body.restaurantPrimaryColor
            : "#6E0F1F",
        restaurantSecondaryColor:
          typeof body.restaurantSecondaryColor === "string" &&
          body.restaurantSecondaryColor.trim().length > 0
            ? body.restaurantSecondaryColor
            : "#4E0915",
      },
      STAFF_SESSION_MAX_AGE_SECONDS * 1000
    );
    const res = NextResponse.json({ ok: true, offline: true });
    res.cookies.set("staff_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
    });
    return res;
  }
}
