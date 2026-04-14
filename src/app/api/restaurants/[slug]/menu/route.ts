import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api-errors";
import { getRestaurantMenuPayload } from "@/lib/public-menu-data";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const restaurantName = req.nextUrl.searchParams.get("name");

  try {
    const payload = await getRestaurantMenuPayload({
      slug,
      name: restaurantName,
    });

    if (payload.error) {
      const status =
        payload.error === "Restaurant not found"
          ? 404
          : payload.error.includes("matches more than one restaurant")
            ? 409
            : 500;
      return jsonError(payload.error, status);
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error(error);
    return jsonError("Failed to load menu", 500);
  }
}
