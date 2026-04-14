import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getStaffSession } from "@/lib/staff-auth";

export async function GET() {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  try {
    const tables = await prisma.table.findMany({
      where: {
        restaurantId: session.restaurantId,
        active: true,
      },
      orderBy: { tableNumber: "asc" },
      select: {
        id: true,
        tableNumber: true,
      },
    });

    return NextResponse.json({ tables });
  } catch (error) {
    console.error(error);
    return jsonError("Failed to load tables", 500);
  }
}
