import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-errors";
import { getStaffLoginRestaurants } from "@/lib/staff-login-restaurants";

export async function GET() {
  try {
    const restaurants = await getStaffLoginRestaurants();

    return NextResponse.json(
      { restaurants },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error) {
    console.error(error);
    return jsonError("Could not load restaurants", 503);
  }
}
