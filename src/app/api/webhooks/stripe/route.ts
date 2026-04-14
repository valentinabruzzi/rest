import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureStoredPrepStationMap } from "@/lib/order-stations";
import { markPaymentCaptured } from "@/lib/order-payment";
import { getStripe } from "@/lib/stripe";
import { ensureOrderReward } from "@/lib/order-reward-server";
import { publishStaffRealtimeEvent } from "@/lib/staff-events";
import Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET missing");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("Webhook signature failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.orderId;
      if (!orderId) return NextResponse.json({ received: true });

      await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
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
        if (!order || order.paymentIntentId !== pi.id) return;
        const now = new Date();

        await tx.order.update({
          where: { id: orderId },
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
          where: { orderId, providerPaymentId: pi.id },
          data: { status: "paid", providerPaymentId: pi.id },
        });

        await ensureOrderReward(tx, orderId);
      });

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { restaurantId: true },
      });
      if (order) {
        publishStaffRealtimeEvent({
          type: "orders-updated",
          restaurantId: order.restaurantId,
          orderId,
        });
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.orderId;
      if (!orderId) return NextResponse.json({ received: true });

      await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order || order.paymentIntentId !== pi.id) return;

        await tx.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: "failed",
            status: "placed_unpaid",
          },
        });

        await tx.payment.updateMany({
          where: { orderId, providerPaymentId: pi.id },
          data: { status: "failed" },
        });
      });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
