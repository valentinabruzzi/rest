import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { revalidateAnalyticsCache } from "@/lib/data-cache";
import { ensureStoredPrepStationMap } from "@/lib/order-stations";
import { markPaymentCaptured } from "@/lib/order-payment";
import { getStripe } from "@/lib/stripe";
import { ensureOrderReward } from "@/lib/order-reward-server";
import { publishStaffRealtimeEvent } from "@/lib/staff-events";

/** Confirms Stripe PaymentIntent server-side (helps when webhook is not yet delivered). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const order = await prisma.order.findUnique({
      where: { id },
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
    if (!order?.paymentIntentId) {
      return jsonError("Order not found", 404);
    }

    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId);

    if (pi.status === "succeeded") {
      const reward = await prisma.$transaction(async (tx) => {
        const now = new Date();
        await tx.order.update({
          where: { id },
          data: {
            paymentStatus: "paid_online",
            status: "paid",
            paidAt: order.paidAt ?? now,
            paymentMeta: markPaymentCaptured(order.paymentMeta, {
              paymentStatus: "paid_online",
              actor: "system",
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
          where: { orderId: id, providerPaymentId: pi.id },
          data: { status: "paid" },
        });

        return ensureOrderReward(tx, id);
      });

      const fresh = await prisma.order.findUnique({
        where: { id },
        select: { status: true, paymentStatus: true },
      });

      publishStaffRealtimeEvent({
        type: "orders-updated",
        restaurantId: order.restaurantId,
        orderId: id,
      });

      revalidateAnalyticsCache();

      return NextResponse.json({
        status: fresh?.status,
        paymentStatus: fresh?.paymentStatus,
        paymentIntentStatus: pi.status,
        reward,
      });
    }

    const fresh = await prisma.order.findUnique({
      where: { id },
      select: { status: true, paymentStatus: true },
    });

    return NextResponse.json({
      status: fresh?.status,
      paymentStatus: fresh?.paymentStatus,
      paymentIntentStatus: pi.status,
      reward: null,
    });
  } catch (e) {
    console.error(e);
    return jsonError("Could not sync payment", 500);
  }
}
