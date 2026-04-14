import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getStaffSession } from "@/lib/staff-auth";
import { revalidateAnalyticsCache } from "@/lib/data-cache";
import { isPrismaTemporarilyUnavailable } from "@/lib/prisma-errors";
import {
  normalizeActiveOrderStatus,
} from "@/lib/order-status";
import { isReleasedPaymentStatus } from "@/lib/order-payment";
import {
  advanceSinglePrepStation,
  applyManagerTransition,
  applyWaiterServedTransition,
  ensureStoredPrepStationMap,
  getAggregateOrderStatusFromStations,
  type PrepStation,
} from "@/lib/order-stations";
import { publishStaffRealtimeEvent } from "@/lib/staff-events";

const patchSchema = z.object({
  status: z.enum(["preparing", "ready", "served"]),
  actor: z
    .enum(["manager", "bar", "kitchen", "waiter"])
    .optional()
    .default("manager"),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  const { id } = await params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid body", 400);
  }

  const order = await prisma.order.findFirst({
    where: {
      id,
      restaurantId: session.restaurantId,
    },
    include: {
      items: {
        include: {
          product: {
            include: {
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!order) return jsonError("Order not found", 404);
  if (!isReleasedPaymentStatus(order.paymentStatus)) {
    return jsonError("Order must be marked as paid before preparation", 400);
  }

  try {
    const now = new Date();
    const stations = ensureStoredPrepStationMap(
      order.items.map((item) => ({
        name: item.productNameSnapshot,
        categoryName: item.product.category?.name ?? null,
        tags: item.product.tags,
      })),
      order.stationStatus,
      order.status
    );

    let nextStations = null as ReturnType<typeof ensureStoredPrepStationMap> | null;

    if (body.actor === "manager") {
      nextStations = applyManagerTransition(stations, body.status);
    } else if (body.actor === "waiter") {
      if (body.status !== "served") {
        return jsonError("Waiter can only mark served", 400);
      }
      nextStations = applyWaiterServedTransition(stations);
    } else {
      if (body.status === "served") {
        return jsonError("This role cannot mark served", 400);
      }
      nextStations = advanceSinglePrepStation(
        stations,
        body.actor as PrepStation,
        body.status
      );
    }

    if (!nextStations) {
      return jsonError("Invalid status transition", 400);
    }

    const aggregateStatus = getAggregateOrderStatusFromStations(nextStations);
    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: aggregateStatus,
        stationStatus: nextStations,
        ...(aggregateStatus === "preparing" || aggregateStatus === "in_preparation"
          ? { preparingAt: order.preparingAt ?? now }
          : {}),
        ...(aggregateStatus === "ready" ? { readyAt: order.readyAt ?? now } : {}),
        ...(aggregateStatus === "served" ? { servedAt: order.servedAt ?? now } : {}),
      },
    });

    publishStaffRealtimeEvent({
      type: "orders-updated",
      restaurantId: session.restaurantId,
      orderId: updated.id,
    });

    revalidateAnalyticsCache();

    return NextResponse.json({
      id: updated.id,
      status: normalizeActiveOrderStatus(updated.status),
      stationStatus: nextStations,
    });
  } catch (e) {
    console.error(e);
    if (isPrismaTemporarilyUnavailable(e)) {
      return jsonError("Temporary database issue", 503);
    }
    return jsonError("Update failed", 500);
  }
}
