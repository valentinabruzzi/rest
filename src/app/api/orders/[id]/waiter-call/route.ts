import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { revalidateAnalyticsCache } from "@/lib/data-cache";
import {
  serializeStaffRequestNote,
  toStaffRequestSummary,
} from "@/lib/staff-request";
import { publishStaffRealtimeEvent } from "@/lib/staff-events";
import type { StaffRequestOption } from "@/types/staff-request";

const REQUEST_OPTIONS: [StaffRequestOption, ...StaffRequestOption[]] = [
  "general",
  "ordering",
  "cutlery_napkins",
  "assistance",
  "table_cleanup",
  "order_information",
];

const bodySchema = z.object({
  requestType: z.enum(REQUEST_OPTIONS).optional().nullable(),
  note: z.string().trim().max(160).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: z.infer<typeof bodySchema>;

  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch {
    return jsonError("Invalid waiter request", 400);
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        table: true,
        restaurant: { select: { name: true } },
      },
    });

    if (!order) {
      return jsonError("Order not found", 404);
    }

    const existing = await prisma.staffRequest.findFirst({
      where: {
        type: "waiter_call",
        orderId: order.id,
        status: { in: ["new", "in_progress"] },
      },
      orderBy: { createdAt: "desc" },
    });

    const request =
      existing ??
      (await prisma.staffRequest.create({
        data: {
          restaurantId: order.restaurantId,
          tableId: order.tableId,
          orderId: order.id,
          type: "waiter_call",
          note: serializeStaffRequestNote({
            kind: "table_assistance",
            requestType: body.requestType ?? "assistance",
            note: body.note ?? null,
          }),
          status: "new",
        },
      }));

    if (!existing) {
      publishStaffRealtimeEvent({
        type: "requests-updated",
        restaurantId: order.restaurantId,
        requestId: request.id,
      });
      revalidateAnalyticsCache();
    }

    return NextResponse.json({
      request: toStaffRequestSummary({
        id: request.id,
        type: request.type,
        note: request.note,
        status: request.status,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        closedAt: request.closedAt,
        restaurantName: order.restaurant.name,
        tableNumber: order.table.tableNumber,
        orderId: order.id,
        orderNumber: order.orderNumber,
      }),
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not call the waiter", 500);
  }
}
