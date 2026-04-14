import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { generateOrderNumber } from "@/lib/order-number";
import { getStripe } from "@/lib/stripe";
import { Prisma } from "@/generated/prisma/client";
import { serializeItemNotes } from "@/lib/item-notes";
import {
  revalidateAnalyticsCache,
  revalidateMenuReadCaches,
} from "@/lib/data-cache";
import {
  consumeDishRadarInventory,
  DishRadarAvailabilityError,
} from "@/lib/dish-radar";
import { getLocalizedMenuItemName } from "@/lib/menu-item-name";
import { createInitialPaymentMeta } from "@/lib/order-payment";
import {
  normalizeProductCustomerNotesConfig,
  type ProductCustomerNoteSelection,
} from "@/lib/product-customer-notes";
import { publishStaffRealtimeEvent } from "@/lib/staff-events";
import {
  serializeStaffRequestNote,
  toStaffRequestSummary,
} from "@/lib/staff-request";
import type { RestaurantLanguageCode } from "@/lib/restaurant-branding";
import { resolveRestaurantIdentity } from "@/lib/restaurant-resolver";

const selectedOptSchema = z.object({
  groupId: z.string(),
  groupName: z.string(),
  optionIds: z.array(z.string()),
  labels: z.array(z.string()),
  priceDeltaCents: z.number().int(),
});

const itemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1).max(99),
  selectedNotes: z
    .array(
      z.object({
        noteId: z.string().trim().min(1).max(80),
        noteLabel: z.string().trim().max(80).optional(),
        optionId: z.string().trim().min(1).max(80).nullable().optional(),
        optionLabel: z.string().trim().max(80).nullable().optional(),
      })
    )
    .default([]),
  notes: z.string().max(500).optional().nullable(),
  selectedOptions: z.array(selectedOptSchema).default([]),
});

const bodySchema = z
  .object({
    restaurantSlug: z.string().min(1),
    restaurantName: z.string().trim().min(1).max(120).optional(),
    tableNumber: z.string().optional(),
    tableId: z.string().optional(),
    customerNote: z.string().max(1000).optional().nullable(),
    payMode: z.enum(["online", "counter"]),
    counterService: z.enum(["cashier", "waiter"]).optional(),
    counterWaiterPayment: z.enum(["card", "cash"]).optional(),
    language: z.enum(["it", "en", "fr", "es", "de"]).optional().default("it"),
    items: z.array(itemSchema).min(1),
  })
  .refine((d) => d.tableNumber != null || d.tableId != null, {
    message: "Table is required",
  })
  .refine(
    (d) =>
      d.payMode !== "counter" ||
      (d.counterService === "cashier" || d.counterService === "waiter"),
    {
      message: "Counter service is required",
      path: ["counterService"],
    }
  )
  .refine(
    (d) =>
      d.payMode !== "counter" ||
      d.counterService !== "waiter" ||
      d.counterWaiterPayment === "card" ||
      d.counterWaiterPayment === "cash",
    {
      message: "Waiter payment preference is required",
      path: ["counterWaiterPayment"],
    }
  );

type ProductRecord = Prisma.ProductGetPayload<{
  include: {
    category: {
      select: {
        name: true;
      };
    };
    optionGroups: {
      include: {
        options: true;
      };
    };
  };
}>;

function getOrderItemSnapshotName(
  product: ProductRecord,
  language: RestaurantLanguageCode
) {
  return getLocalizedMenuItemName({
    baseName: product.name,
    translations: product.nameTranslations,
    language,
  });
}

async function uniqueOrderNumber(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const n = generateOrderNumber();
    const exists = await prisma.order.findUnique({ where: { orderNumber: n } });
    if (!exists) return n;
  }
  throw new Error("Could not allocate order number");
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json();
    body = bodySchema.parse(raw);
  } catch {
    return jsonError("Invalid order payload", 400);
  }

  const resolvedRestaurant = await resolveRestaurantIdentity({
    slug: body.restaurantSlug,
    name: body.restaurantName,
    activeOnly: true,
  });
  if (resolvedRestaurant.status === "ambiguous") {
    return jsonError(
      "This slug matches more than one restaurant. Refresh the menu and reopen the correct venue.",
      409
    );
  }
  if (resolvedRestaurant.status !== "ok") {
    return jsonError("Restaurant not found", 404);
  }
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: resolvedRestaurant.restaurant.id },
  });
  if (!restaurant) return jsonError("Restaurant not found", 404);

  const table = await prisma.table.findFirst({
    where: {
      restaurantId: restaurant.id,
      active: true,
      ...(body.tableId
        ? { id: body.tableId }
        : { tableNumber: body.tableNumber!.trim() }),
    },
  });
  if (!table) return jsonError("Table not found", 404);

  if (body.payMode === "counter" && !restaurant.allowPayAtCounter) {
    return jsonError("Pay at counter is not available here", 400);
  }

  const productIds = [...new Set(body.items.map((i) => i.productId))];
  const products: ProductRecord[] = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      restaurantId: restaurant.id,
      active: true,
    },
    include: {
      category: {
        select: {
          name: true,
        },
      },
      optionGroups: { include: { options: true } },
    },
  });
  if (products.length !== productIds.length) {
    return jsonError("One or more items are no longer available", 400);
  }
  const byId = new Map<string, ProductRecord>(
    products.map((product: ProductRecord) => [product.id, product])
  );
  let subtotal = 0;
  const linePayload: {
    productId: string;
    productNameSnapshot: string;
    unitPrice: number;
    quantity: number;
    selectedOptions: Prisma.InputJsonValue;
    notes: string | null;
    lineTotal: number;
  }[] = [];

  for (const line of body.items) {
    const p = byId.get(line.productId)!;
    const groups = p.optionGroups;
    const availableCustomerNotes = normalizeProductCustomerNotesConfig(
      p.customerNotesConfig
    );
    const noteConfigById = new Map(
      availableCustomerNotes.map((noteConfig) => [noteConfig.id, noteConfig])
    );
    const seenSelectedNoteIds = new Set<string>();
    const normalizedSelectedNotes: ProductCustomerNoteSelection[] = [];
    const selectedByGroup = new Map(
      line.selectedOptions.map((s) => [s.groupId, s])
    );

    for (const selection of line.selectedNotes) {
      if (seenSelectedNoteIds.has(selection.noteId)) {
        return jsonError("Duplicate customer notes are not allowed", 400);
      }

      const noteConfig = noteConfigById.get(selection.noteId);
      if (!noteConfig) {
        return jsonError("Invalid customer note", 400);
      }

      if (noteConfig.kind === "choice") {
        if (!selection.optionId) {
          return jsonError(`Please choose an option for “${noteConfig.label}”.`, 400);
        }

        const option = noteConfig.options.find(
          (customerNoteOption) => customerNoteOption.id === selection.optionId
        );
        if (!option) {
          return jsonError("Invalid customer note option", 400);
        }

        normalizedSelectedNotes.push({
          noteId: noteConfig.id,
          noteLabel: noteConfig.label,
          optionId: option.id,
          optionLabel: option.label,
        });
      } else {
        if (selection.optionId) {
          return jsonError("Single customer notes cannot include options", 400);
        }

        normalizedSelectedNotes.push({
          noteId: noteConfig.id,
          noteLabel: noteConfig.label,
          optionId: null,
          optionLabel: null,
        });
      }

      seenSelectedNoteIds.add(selection.noteId);
    }

    for (const g of groups) {
      const sel = selectedByGroup.get(g.id);
      if (g.required && (!sel || sel.optionIds.length === 0)) {
        return jsonError(`Please choose an option for “${g.name}” on “${p.name}”.`, 400);
      }
      if (!sel) continue;
      if (!g.multiple && sel.optionIds.length > 1) {
        return jsonError(`Only one choice allowed for “${g.name}”.`, 400);
      }
      const validIds = new Set(g.options.map((o: (typeof g.options)[number]) => o.id));
      for (const oid of sel.optionIds) {
        if (!validIds.has(oid)) {
          return jsonError("Invalid product options", 400);
        }
      }
    }

    let optionExtra = 0;
    const normalisedOptions: typeof line.selectedOptions = [];
    for (const s of line.selectedOptions) {
      const g = groups.find((x: (typeof groups)[number]) => x.id === s.groupId);
      if (!g) return jsonError("Invalid option group", 400);
      let delta = 0;
      const labels: string[] = [];
      for (const oid of s.optionIds) {
        const opt = g.options.find((o: (typeof g.options)[number]) => o.id === oid);
        if (!opt) return jsonError("Invalid option", 400);
        delta += opt.priceDelta;
        labels.push(opt.name);
      }
      optionExtra += delta;
      normalisedOptions.push({
        groupId: g.id,
        groupName: g.name,
        optionIds: s.optionIds,
        labels,
        priceDeltaCents: delta,
      });
    }

    const unit = p.price + optionExtra;
    const lineTotal = unit * line.quantity;
    subtotal += lineTotal;
    linePayload.push({
      productId: p.id,
      productNameSnapshot: getOrderItemSnapshotName(p, body.language),
      unitPrice: unit,
      quantity: line.quantity,
      selectedOptions: normalisedOptions as unknown as Prisma.InputJsonValue,
      notes: serializeItemNotes({
        selections: normalizedSelectedNotes,
        note: line.notes?.trim() || null,
      }),
      lineTotal,
    });
  }

  const discount = 0;
  const feePct = Number(restaurant.serviceFeePercent);
  const serviceFee = Math.round((subtotal * feePct) / 100);
  const total = subtotal - discount + serviceFee;

  const orderNumber = await uniqueOrderNumber();

  const status = "placed_unpaid" as const;
  const paymentStatus = "pending" as const;

  try {
    const order = await prisma.$transaction(async (tx) => {
      const currentRestaurant = await tx.restaurant.findUnique({
        where: { id: restaurant.id },
        select: { settings: true },
      });

      const inventoryResult = consumeDishRadarInventory({
        settings: currentRestaurant?.settings ?? null,
        products: products.map((product) => ({
          id: product.id,
          name: product.name,
          active: product.active,
        })),
        items: body.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      });

      if (inventoryResult.changed) {
        await tx.restaurant.update({
          where: { id: restaurant.id },
          data: {
            settings: inventoryResult.settings as Prisma.InputJsonValue,
          },
        });
      }

      const counterPaymentRequestNote =
        body.payMode === "counter"
          ? serializeStaffRequestNote({
              kind: "payment_request",
              requestType:
                body.counterService === "waiter"
                  ? body.counterWaiterPayment === "card"
                    ? "payment_card"
                    : "payment_cash"
                  : "payment_counter",
            })
          : null;

      const o = await tx.order.create({
        data: {
          restaurantId: restaurant.id,
          tableId: table.id,
          orderNumber,
          status,
          subtotal,
          discount,
          serviceFee,
          total,
          paymentStatus,
          paymentMeta: createInitialPaymentMeta({
            payMode: body.payMode,
            counterService: body.counterService,
            counterWaiterPayment: body.counterWaiterPayment,
          }) as Prisma.InputJsonValue,
          customerNote: body.customerNote?.trim() || null,
          items: {
            create: linePayload.map((l) => ({
              productId: l.productId,
              productNameSnapshot: l.productNameSnapshot,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              selectedOptions: l.selectedOptions,
              notes: l.notes,
              lineTotal: l.lineTotal,
            })),
          },
        },
      });

      if (body.payMode === "counter") {
        await tx.payment.create({
          data: {
            orderId: o.id,
            provider: "counter",
            amount: total,
            status: "pending",
          },
        });

        const waiterRequest = await tx.staffRequest.create({
          data: {
            restaurantId: restaurant.id,
            tableId: table.id,
            orderId: o.id,
            type: "waiter_call",
            note: counterPaymentRequestNote,
            status: "new",
          },
        });

        return {
          order: o,
          clientSecret: null as string | null,
          waiterRequest,
        };
      }

      const stripe = getStripe();
      const pi = await stripe.paymentIntents.create({
        amount: total,
        currency: restaurant.currency.toLowerCase(),
        metadata: {
          orderId: o.id,
          restaurantId: restaurant.id,
        },
        automatic_payment_methods: { enabled: true },
      });

      await tx.order.update({
        where: { id: o.id },
        data: { paymentIntentId: pi.id },
      });

      await tx.payment.create({
        data: {
          orderId: o.id,
          provider: "stripe",
          providerPaymentId: pi.id,
          amount: total,
          status: "pending",
        },
      });

      return { order: o, clientSecret: pi.client_secret, waiterRequest: null };
    });

    if (body.payMode === "counter") {
      publishStaffRealtimeEvent({
        type: "orders-updated",
        restaurantId: restaurant.id,
        orderId: order.order.id,
      });
      if (order.waiterRequest) {
        publishStaffRealtimeEvent({
          type: "requests-updated",
          restaurantId: restaurant.id,
          requestId: order.waiterRequest.id,
        });
      }
    }

    revalidateMenuReadCaches();
    revalidateAnalyticsCache();

    return NextResponse.json({
      orderId: order.order.id,
      orderNumber: order.order.orderNumber,
      status: order.order.status,
      paymentStatus: order.order.paymentStatus,
      total,
      subtotal,
      serviceFee,
      discount,
      clientSecret: order.clientSecret,
      payMode: body.payMode,
      waiterRequest: order.waiterRequest
        ? toStaffRequestSummary({
            id: order.waiterRequest.id,
            type: order.waiterRequest.type,
            note: order.waiterRequest.note,
            status: order.waiterRequest.status,
            createdAt: order.waiterRequest.createdAt,
            updatedAt: order.waiterRequest.updatedAt,
            closedAt: order.waiterRequest.closedAt,
            restaurantName: restaurant.name,
            tableNumber: table.tableNumber,
            orderId: order.order.id,
            orderNumber: order.order.orderNumber,
          })
        : null,
    });
  } catch (e) {
    if (e instanceof DishRadarAvailabilityError) {
      return jsonError(e.message, 400);
    }

    console.error(e);
    return jsonError("Could not place order. Please try again.", 500);
  }
}
