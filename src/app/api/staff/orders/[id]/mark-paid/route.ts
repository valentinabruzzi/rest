import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getStaffSession } from "@/lib/staff-auth";
import { revalidateAnalyticsCache } from "@/lib/data-cache";
import { isPrismaTemporarilyUnavailable } from "@/lib/prisma-errors";
import { ensureStoredPrepStationMap } from "@/lib/order-stations";
import {
  getPendingPaymentFlow,
  isReleasedPaymentStatus,
  markPaymentCaptured,
} from "@/lib/order-payment";
import { getStaffRequestKind } from "@/lib/staff-request";
import { publishStaffRealtimeEvent } from "@/lib/staff-events";

const bodySchema = z.object({
  actor: z.enum(["manager", "waiter"]),
  actorLabel: z.string().trim().max(80).optional().nullable(),
  paymentStatus: z.enum(["paid_cash", "paid_counter_card", "paid_at_table"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  const { id } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
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
      staffRequests: true,
    },
  });

  if (!order) return jsonError("Order not found", 404);
  if (order.status === "cancelled") {
    return jsonError("Cancelled order cannot be marked as paid", 400);
  }
  if (isReleasedPaymentStatus(order.paymentStatus)) {
    return jsonError("Order is already paid", 400);
  }

  const pendingFlow = getPendingPaymentFlow(order.paymentMeta);
  if (body.paymentStatus === "paid_at_table" && pendingFlow !== "waiter") {
    return jsonError("Table payment can only be confirmed for table flows", 400);
  }
  if (
    (body.paymentStatus === "paid_cash" ||
      body.paymentStatus === "paid_counter_card") &&
    pendingFlow === "waiter"
  ) {
    return jsonError("Counter payment can only be confirmed for counter flows", 400);
  }
  if (body.actor === "waiter" && body.paymentStatus === "paid_counter_card") {
    return jsonError("Waiter can only confirm cash counter payments", 400);
  }

  try {
    const now = new Date();
    const paymentRequestIds = order.staffRequests
      .filter(
        (request) =>
          request.status !== "closed" &&
          getStaffRequestKind(request.note) === "payment_request"
      )
      .map((request) => request.id);

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          paymentStatus: body.paymentStatus,
          status: "paid",
          paidAt: order.paidAt ?? now,
          paymentMeta: markPaymentCaptured(order.paymentMeta, {
            paymentStatus: body.paymentStatus,
            actor: body.actor,
            actorLabel: body.actorLabel,
          }),
          stationStatus: ensureStoredPrepStationMap(
            order.items.map((item) => ({
              name: item.productNameSnapshot,
              categoryName: item.product.category?.name ?? null,
              tags: item.product.tags,
            })),
            order.stationStatus,
            "paid"
          ),
        },
      });

      await tx.payment.updateMany({
        where: {
          orderId: id,
          status: "pending",
        },
        data: {
          status: "paid",
        },
      });

      if (paymentRequestIds.length > 0) {
        await tx.staffRequest.updateMany({
          where: {
            id: {
              in: paymentRequestIds,
            },
          },
          data: {
            status: "closed",
            closedAt: now,
          },
        });
      }
    });

    publishStaffRealtimeEvent({
      type: "orders-updated",
      restaurantId: session.restaurantId,
      orderId: id,
    });

    if (paymentRequestIds.length > 0) {
      publishStaffRealtimeEvent({
        type: "requests-updated",
        restaurantId: session.restaurantId,
        requestId: paymentRequestIds[0],
      });
    }

    revalidateAnalyticsCache();

    const fresh = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        paidAt: true,
      },
    });

    return NextResponse.json({
      orderId: fresh?.id ?? id,
      status: fresh?.status ?? "paid",
      paymentStatus: fresh?.paymentStatus ?? body.paymentStatus,
      paidAt: fresh?.paidAt?.toISOString() ?? now.toISOString(),
    });
  } catch (error) {
    console.error(error);
    if (isPrismaTemporarilyUnavailable(error)) {
      return jsonError("Temporary database issue", 503);
    }
    return jsonError("Could not confirm payment", 500);
  }
}
