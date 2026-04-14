import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { revalidateAnalyticsCache } from "@/lib/data-cache";
import {
  getStaffRequestKind,
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const table = await prisma.table.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!table || !table.active) {
      return jsonError("Table not found", 404);
    }

    const openRequests = await prisma.staffRequest.findMany({
      where: {
        tableId: table.id,
        orderId: null,
        type: "waiter_call",
        status: { in: ["new", "in_progress"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const request =
      openRequests.find(
        (entry) => getStaffRequestKind(entry.note) === "table_assistance"
      ) ?? null;

    return NextResponse.json({
      request: request
        ? toStaffRequestSummary({
            id: request.id,
            type: request.type,
            note: request.note,
            status: request.status,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
            closedAt: request.closedAt,
            restaurantName: table.restaurant.name,
            tableNumber: table.tableNumber,
            orderId: request.orderId,
            orderNumber: null,
          })
        : null,
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not load waiter request", 500);
  }
}

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
    const table = await prisma.table.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!table || !table.active) {
      return jsonError("Table not found", 404);
    }

    const openRequests = await prisma.staffRequest.findMany({
      where: {
        tableId: table.id,
        orderId: null,
        type: "waiter_call",
        status: { in: ["new", "in_progress"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const existing = openRequests.find(
      (request) => getStaffRequestKind(request.note) === "table_assistance"
    );

    const request =
      existing ??
      (await prisma.staffRequest.create({
        data: {
          restaurantId: table.restaurantId,
          tableId: table.id,
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
        restaurantId: table.restaurantId,
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
        restaurantName: table.restaurant.name,
        tableNumber: table.tableNumber,
        orderId: request.orderId,
        orderNumber: null,
      }),
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not call the waiter", 500);
  }
}
