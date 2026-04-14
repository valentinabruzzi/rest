import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-auth";
import { jsonError } from "@/lib/api-errors";
import { buildStaffAnalytics } from "@/lib/staff-analytics";
import type { AnalyticsRangeDays } from "@/types/staff-analytics";

const ALLOWED_RANGES: AnalyticsRangeDays[] = [7, 14, 30];

export async function GET(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  const requested = Number(req.nextUrl.searchParams.get("days") ?? 14);
  const rangeDays = ALLOWED_RANGES.includes(requested as AnalyticsRangeDays)
    ? (requested as AnalyticsRangeDays)
    : 14;

  try {
    const analytics = await buildStaffAnalytics(rangeDays, session.restaurantId);
    return NextResponse.json(analytics, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not load analytics", 500);
  }
}
