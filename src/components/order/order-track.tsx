"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OrderStatusTracker } from "@/components/menu/order-status-tracker";
import { formatCents } from "@/lib/money";
import { WaiterCallPanel } from "@/components/order/waiter-call-panel";
import type { StaffRequestSummary } from "@/types/staff-request";
import {
  formatProductCustomerNoteSelections,
  type ProductCustomerNoteSelection,
} from "@/lib/product-customer-notes";

type OrderPayload = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  discount: number;
  serviceFee: number;
  total: number;
  tableNumber: string;
  restaurantName: string;
  waiterRequest: StaffRequestSummary | null;
  items: {
    id: string;
    productName: string;
    quantity: number;
    lineTotal: number;
    selectedNotes: ProductCustomerNoteSelection[];
    notes: string | null;
    selectedOptions: unknown;
  }[];
};

export function OrderTrack({ orderId }: { orderId: string }) {
  const [data, setData] = useState<OrderPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${orderId}`);
    const j = await res.json();
    if (!res.ok) {
      setErr(j.error ?? "Order not found");
      return;
    }
    setData(j);
    setErr(null);
  }, [orderId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (err) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-xl font-semibold">Order</h1>
        <p className="mt-3 text-sm text-muted">{err}</p>
        <Link href="/" className="mt-8 inline-block text-sm text-bordeaux">
          Home
        </Link>
      </main>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
        {data.restaurantName}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Order #{data.orderNumber}
      </h1>
      <p className="mt-1 text-sm text-muted">Table {data.tableNumber}</p>
      <p className="mt-4 text-sm text-muted">
        Payment:{" "}
        <span className="font-medium text-ink">{data.paymentStatus}</span>
      </p>

      <OrderStatusTracker status={data.status} />
      <WaiterCallPanel
        orderId={data.id}
        waiterRequest={data.waiterRequest}
        onRequestChange={(nextRequest) =>
          setData((current) =>
            current
              ? {
                  ...current,
                  waiterRequest: nextRequest,
                }
              : current
          )
        }
      />

      <div className="mt-8 rounded-[var(--radius-card)] border border-hairline bg-canvas-elevated p-4 shadow-[var(--shadow-soft)]">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Items
        </p>
        <ul className="mt-3 space-y-3">
          {data.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 text-sm">
              <span>
                {i.quantity}× {i.productName}
                {i.selectedNotes.length > 0 ? (
                  <span className="mt-0.5 block text-xs text-muted">
                    Note: {formatProductCustomerNoteSelections(i.selectedNotes)}
                  </span>
                ) : null}
                {i.notes ? (
                  <span className="mt-0.5 block text-xs italic text-muted">
                    {i.notes}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {formatCents(i.lineTotal, "EUR")}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-between border-t border-hairline pt-3 text-sm font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatCents(data.total, "EUR")}</span>
        </div>
      </div>

      <Link
        href="/"
        className="mt-8 block rounded-[var(--radius-card)] bg-bordeaux py-3 text-center text-sm font-medium text-white"
      >
        Home
      </Link>
    </main>
  );
}
