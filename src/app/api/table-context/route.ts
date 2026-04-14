import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api-errors";
import { getTableContextData } from "@/lib/public-menu-data";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? req.nextUrl.searchParams.get("t");
  const restaurantSlug = req.nextUrl.searchParams.get("restaurant");
  const restaurantName = req.nextUrl.searchParams.get("name");
  const tableNumber = req.nextUrl.searchParams.get("table");

  try {
    const result = await getTableContextData({
      token: token ?? undefined,
      restaurantSlug: restaurantSlug ?? undefined,
      restaurantName: restaurantName ?? undefined,
      tableNumber: tableNumber ?? undefined,
    });

    if (result.error || !result.data) {
      const status =
        result.error === "Missing table or restaurant information. Open the link from your table QR code."
          ? 400
          : result.error === "This slug matches more than one restaurant. Open the full link for the correct venue."
            ? 409
            : 404;
      return jsonError(
        result.error ?? "Something went wrong. Please try again.",
        status
      );
    }

    return NextResponse.json(result.data, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error(error);
    return jsonError("Something went wrong. Please try again.", 500);
  }
}
