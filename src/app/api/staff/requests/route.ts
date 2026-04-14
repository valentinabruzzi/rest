import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getStaffSession } from "@/lib/staff-auth";
import { isPrismaTemporarilyUnavailable } from "@/lib/prisma-errors";
import { toStaffRequestSummary } from "@/lib/staff-request";

export async function GET() {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  try {
    const requests = await prisma.staffRequest.findMany({
      where: {
        restaurantId: session.restaurantId,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 80,
      include: {
        table: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
        restaurant: {
          select: {
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      requests: requests.map((request) =>
        toStaffRequestSummary({
          id: request.id,
          type: request.type,
          note: request.note,
          status: request.status,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
          closedAt: request.closedAt,
          restaurantName: request.restaurant.name,
          tableNumber: request.table.tableNumber,
          orderId: request.order?.id ?? null,
          orderNumber: request.order?.orderNumber ?? null,
        })
      ),
    });
  } catch (error) {
    console.error(error);
    if (isPrismaTemporarilyUnavailable(error)) {
      return jsonError("Staff data temporarily unavailable", 503);
    }
    return jsonError("Failed to load staff requests", 500);
  }
}
