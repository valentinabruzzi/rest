import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { parseItemNotes } from "@/lib/item-notes";
import { toStaffRequestSummary } from "@/lib/staff-request";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        table: true,
        items: true,
        restaurant: { select: { name: true, slug: true, currency: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        staffRequests: {
          where: { type: "waiter_call" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!order) return jsonError("Order not found", 404);

    return NextResponse.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      subtotal: order.subtotal,
      discount: order.discount,
      serviceFee: order.serviceFee,
      total: order.total,
      customerNote: order.customerNote,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      tableNumber: order.table.tableNumber,
      restaurantName: order.restaurant.name,
      waiterRequest: order.staffRequests[0]
        ? toStaffRequestSummary({
            id: order.staffRequests[0].id,
            type: order.staffRequests[0].type,
            note: order.staffRequests[0].note,
            status: order.staffRequests[0].status,
            createdAt: order.staffRequests[0].createdAt,
            updatedAt: order.staffRequests[0].updatedAt,
            closedAt: order.staffRequests[0].closedAt,
            restaurantName: order.restaurant.name,
            tableNumber: order.table.tableNumber,
            orderId: order.id,
            orderNumber: order.orderNumber,
          })
        : null,
      items: order.items.map((i: (typeof order.items)[number]) => {
        const parsedNotes = parseItemNotes(i.notes);
        return {
          id: i.id,
          productName: i.productNameSnapshot,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
          selectedOptions: i.selectedOptions,
          notes: parsedNotes.note,
          selectedNotes: parsedNotes.selections,
          lineTotal: i.lineTotal,
        };
      }),
    });
  } catch (e) {
    console.error(e);
    return jsonError("Failed to load order", 500);
  }
}
