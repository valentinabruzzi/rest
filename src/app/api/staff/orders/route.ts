import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getStaffSession } from "@/lib/staff-auth";
import { revalidateAnalyticsCache, revalidateMenuReadCaches } from "@/lib/data-cache";
import { isPrismaTemporarilyUnavailable } from "@/lib/prisma-errors";
import {
  consumeDishRadarInventory,
  DishRadarAvailabilityError,
} from "@/lib/dish-radar";
import { serializeItemNotes } from "@/lib/item-notes";
import { generateOrderNumber } from "@/lib/order-number";
import { getLocalizedMenuItemName } from "@/lib/menu-item-name";
import {
  createInitialPaymentMeta,
  markPaymentCaptured,
} from "@/lib/order-payment";
import {
  normalizeProductCustomerNotesConfig,
  type ProductCustomerNoteSelection,
} from "@/lib/product-customer-notes";
import { serializeStaffRequestNote } from "@/lib/staff-request";
import { ensureStoredPrepStationMap } from "@/lib/order-stations";
import { publishStaffRealtimeEvent } from "@/lib/staff-events";
import type { RestaurantLanguageCode } from "@/lib/restaurant-branding";
import { getStaffOrdersPayload } from "@/lib/staff-view-data";

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

const createStaffOrderSchema = z.object({
  tableId: z.string().min(1),
  customerNote: z.string().max(1000).optional().nullable(),
  paymentLocation: z.enum(["cashier", "table"]),
  paymentMethod: z.enum(["card", "cash"]),
  clientMutationId: z.string().trim().max(120).optional().nullable(),
  language: z.enum(["it", "en", "fr", "es", "de"]).optional().default("it"),
  items: z.array(itemSchema).min(1),
});

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
  for (let index = 0; index < 8; index += 1) {
    const nextOrderNumber = generateOrderNumber();
    const existing = await prisma.order.findUnique({
      where: { orderNumber: nextOrderNumber },
      select: { id: true },
    });
    if (!existing) return nextOrderNumber;
  }

  throw new Error("Could not allocate order number");
}

const servedRangeSchema = z
  .enum(["hour", "today", "week", "month", "year"])
  .catch("today");

export async function GET(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  try {
    const servedRange = servedRangeSchema.parse(
      req.nextUrl.searchParams.get("servedRange") ?? "today"
    );
    const orders = await getStaffOrdersPayload(session.restaurantId, {
      servedRange,
    });

    return NextResponse.json({
      orders,
    });
  } catch (e) {
    console.error(e);
    if (isPrismaTemporarilyUnavailable(e)) {
      return jsonError("Staff data temporarily unavailable", 503);
    }
    return jsonError("Failed to load orders", 500);
  }
}

export async function POST(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  let body: z.infer<typeof createStaffOrderSchema>;
  try {
    body = createStaffOrderSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid staff order payload", 400);
  }

  if (body.clientMutationId) {
    try {
      const existing = await prisma.order.findFirst({
        where: {
          restaurantId: session.restaurantId,
          paymentMeta: {
            path: ["clientMutationId"],
            equals: body.clientMutationId,
          },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          paidAt: true,
          total: true,
        },
      });

      if (existing) {
        return NextResponse.json({
          orderId: existing.id,
          orderNumber: existing.orderNumber,
          status: existing.status,
          paymentStatus: existing.paymentStatus,
          paidAt: existing.paidAt?.toISOString() ?? new Date().toISOString(),
          total: existing.total,
          reused: true,
        });
      }
    } catch (error) {
      if (isPrismaTemporarilyUnavailable(error)) {
        return jsonError("Temporary database issue", 503);
      }

      console.error(error);
    }
  }

  const table = await prisma.table.findFirst({
    where: {
      id: body.tableId,
      restaurantId: session.restaurantId,
      active: true,
    },
  });
  if (!table) {
    return jsonError("Table not found", 404);
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.restaurantId },
    select: {
      id: true,
      name: true,
      currency: true,
      serviceFeePercent: true,
    },
  });
  if (!restaurant) {
    return jsonError("Restaurant not found", 404);
  }

  const productIds = [...new Set(body.items.map((item) => item.productId))];
  const products: ProductRecord[] = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      restaurantId: session.restaurantId,
      active: true,
    },
    include: {
      category: {
        select: {
          name: true,
        },
      },
      optionGroups: {
        include: { options: true },
      },
    },
  });

  if (products.length !== productIds.length) {
    return jsonError("One or more items are no longer available", 400);
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  let subtotal = 0;
  const linePayload: Array<{
    productId: string;
    productNameSnapshot: string;
    unitPrice: number;
    quantity: number;
    selectedOptions: Prisma.InputJsonValue;
    notes: string | null;
    lineTotal: number;
    categoryName: string | null;
    tags: string[];
  }> = [];

  for (const line of body.items) {
    const product = productById.get(line.productId);
    if (!product) {
      return jsonError("One or more items are no longer available", 400);
    }

    const groups = product.optionGroups;
    const availableCustomerNotes = normalizeProductCustomerNotesConfig(
      product.customerNotesConfig
    );
    const noteConfigById = new Map(
      availableCustomerNotes.map((noteConfig) => [noteConfig.id, noteConfig])
    );
    const seenSelectedNoteIds = new Set<string>();
    const normalizedSelectedNotes: ProductCustomerNoteSelection[] = [];
    const selectedByGroup = new Map(
      line.selectedOptions.map((selection) => [selection.groupId, selection])
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

    for (const group of groups) {
      const selection = selectedByGroup.get(group.id);
      if (group.required && (!selection || selection.optionIds.length === 0)) {
        return jsonError(
          `Please choose an option for “${group.name}” on “${product.name}”.`,
          400
        );
      }

      if (!selection) continue;

      if (!group.multiple && selection.optionIds.length > 1) {
        return jsonError(`Only one choice allowed for “${group.name}”.`, 400);
      }

      const validIds = new Set(group.options.map((option) => option.id));
      for (const optionId of selection.optionIds) {
        if (!validIds.has(optionId)) {
          return jsonError("Invalid product options", 400);
        }
      }
    }

    let optionExtra = 0;
    const normalizedOptions: typeof line.selectedOptions = [];
    for (const selection of line.selectedOptions) {
      const group = groups.find((entry) => entry.id === selection.groupId);
      if (!group) return jsonError("Invalid option group", 400);

      let delta = 0;
      const labels: string[] = [];
      for (const optionId of selection.optionIds) {
        const option = group.options.find((entry) => entry.id === optionId);
        if (!option) return jsonError("Invalid option", 400);
        delta += option.priceDelta;
        labels.push(option.name);
      }

      optionExtra += delta;
      normalizedOptions.push({
        groupId: group.id,
        groupName: group.name,
        optionIds: selection.optionIds,
        labels,
        priceDeltaCents: delta,
      });
    }

    const unitPrice = product.price + optionExtra;
    const lineTotal = unitPrice * line.quantity;
    subtotal += lineTotal;
    linePayload.push({
      productId: product.id,
      productNameSnapshot: getOrderItemSnapshotName(product, body.language),
      unitPrice,
      quantity: line.quantity,
      selectedOptions: normalizedOptions as unknown as Prisma.InputJsonValue,
      notes: serializeItemNotes({
        selections: normalizedSelectedNotes,
        note: line.notes?.trim() || null,
      }),
      lineTotal,
      categoryName: product.category?.name ?? null,
      tags: product.tags,
    });
  }

  const serviceFee = Math.round(
    (subtotal * Number(restaurant.serviceFeePercent)) / 100
  );
  const total = subtotal + serviceFee;
  const paymentStatus: "paid_at_table" | "paid_cash" | "paid_counter_card" =
    body.paymentLocation === "table"
      ? "paid_at_table"
      : body.paymentMethod === "cash"
        ? "paid_cash"
        : "paid_counter_card";
  const paymentRequestType =
    body.paymentLocation === "table"
      ? body.paymentMethod === "card"
        ? "payment_card"
        : "payment_cash"
      : "payment_counter";
  const orderNumber = await uniqueOrderNumber();
  const paidAt = new Date();

  try {
    const order = await prisma.$transaction(async (tx) => {
      const currentRestaurant = await tx.restaurant.findUnique({
        where: { id: session.restaurantId },
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
          where: { id: session.restaurantId },
          data: {
            settings: inventoryResult.settings as Prisma.InputJsonValue,
          },
        });
      }

      const paymentMeta = markPaymentCaptured(
        createInitialPaymentMeta({
          payMode: "counter",
          counterService:
            body.paymentLocation === "table" ? "waiter" : "cashier",
          counterWaiterPayment:
            body.paymentLocation === "table" ? body.paymentMethod : undefined,
          clientMutationId: body.clientMutationId,
        }) as Prisma.JsonValue,
        {
          paymentStatus,
          actor: "waiter",
        }
      );

      return tx.order.create({
        data: {
          restaurantId: session.restaurantId,
          tableId: table.id,
          orderNumber,
          status: "paid",
          subtotal,
          discount: 0,
          serviceFee,
          total,
          paymentStatus,
          paidAt,
          paymentMeta: paymentMeta as Prisma.InputJsonValue,
          customerNote: body.customerNote?.trim() || null,
          stationStatus: ensureStoredPrepStationMap(
            linePayload.map((line) => ({
              name: line.productNameSnapshot,
              categoryName: line.categoryName,
              tags: line.tags,
            })),
            null,
            "paid"
          ) as unknown as Prisma.InputJsonValue,
          items: {
            create: linePayload.map((line) => ({
              productId: line.productId,
              productNameSnapshot: line.productNameSnapshot,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              selectedOptions: line.selectedOptions,
              notes: line.notes,
              lineTotal: line.lineTotal,
            })),
          },
          payments: {
            create: {
              provider: "counter",
              amount: total,
              status: "paid",
            },
          },
          staffRequests: {
            create: {
              restaurantId: session.restaurantId,
              tableId: table.id,
              type: "waiter_call",
              note: serializeStaffRequestNote({
                kind: "payment_request",
                requestType: paymentRequestType,
              }),
              status: "closed",
              closedAt: paidAt,
            },
          },
        },
      });
    });

    publishStaffRealtimeEvent({
      type: "orders-updated",
      restaurantId: session.restaurantId,
      orderId: order.id,
    });
    publishStaffRealtimeEvent({
      type: "requests-updated",
      restaurantId: session.restaurantId,
      orderId: order.id,
    });

    revalidateMenuReadCaches();
    revalidateAnalyticsCache();

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paidAt: order.paidAt?.toISOString() ?? paidAt.toISOString(),
      total,
    });
  } catch (error) {
    if (error instanceof DishRadarAvailabilityError) {
      return jsonError(error.message, 400);
    }
    if (isPrismaTemporarilyUnavailable(error)) {
      return jsonError("Temporary database issue", 503);
    }

    console.error(error);
    return jsonError("Could not create staff order", 500);
  }
}
