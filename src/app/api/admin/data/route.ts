import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getAdminAuthorized } from "@/lib/staff-auth";
import { DATA_CACHE_TAGS } from "@/lib/data-cache";

async function getCachedAdminData() {
  const restaurants = await prisma.restaurant.findMany({
    orderBy: { name: "asc" },
    include: {
      tables: { orderBy: { tableNumber: "asc" } },
      staffUsers: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        take: 10,
      },
    },
  });

  return {
    restaurants: restaurants.map((restaurant: (typeof restaurants)[number]) => ({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      logoUrl: restaurant.logoUrl,
      primaryColor: restaurant.primaryColor,
      secondaryColor: restaurant.secondaryColor,
      active: restaurant.active,
      currency: restaurant.currency,
      allowPayAtCounter: restaurant.allowPayAtCounter,
      serviceFeePercent: Number(restaurant.serviceFeePercent),
      theme: restaurant.theme,
      settings: restaurant.settings,
      openingHours: restaurant.openingHours,
      paymentConfig: restaurant.paymentConfig,
      rewardConfig: restaurant.rewardConfig,
      staffConfigured: restaurant.staffUsers.length > 0,
      tables: restaurant.tables.map((table: (typeof restaurant.tables)[number]) => ({
        id: table.id,
        tableNumber: table.tableNumber,
        qrCodeToken: table.qrCodeToken,
        active: table.active,
      })),
    })),
  };
}

export async function GET() {
  const ok = await getAdminAuthorized();
  if (!ok) return jsonError("Unauthorized", 401);

  try {
    const payload = await getCachedAdminData();

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    return jsonError("Failed to load data", 500);
  }
}
