import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-errors";
import { getStaffSession } from "@/lib/staff-auth";
import { isPrismaTemporarilyUnavailable } from "@/lib/prisma-errors";
import { getStaffOrderTakingPayload } from "@/lib/staff-view-data";

export async function GET() {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  try {
    const payload = await getStaffOrderTakingPayload({
      restaurantId: session.restaurantId,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error(error);
    if (isPrismaTemporarilyUnavailable(error)) {
      return jsonError("Temporary database issue", 503);
    }
    return jsonError("Failed to load order taking data", 500);
  }
}
