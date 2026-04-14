import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getAdminAuthorized } from "@/lib/staff-auth";
import { revalidateAllRestaurantReadCaches } from "@/lib/data-cache";

const createSchema = z.object({
  tableNumbers: z.array(z.string().trim().min(1)).min(1).max(300),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await getAdminAuthorized();
  if (!ok) return jsonError("Unauthorized", 401);

  const { id } = await params;
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid tables payload", 400);
  }

  const normalizedTableNumbers = [...new Set(body.tableNumbers.map((value) => value.trim()))];

  try {
    const existingTables = await prisma.table.findMany({
      where: {
        restaurantId: id,
        tableNumber: { in: normalizedTableNumbers },
      },
      select: {
        tableNumber: true,
      },
    });
    const existingNumbers = new Set(
      existingTables.map((table: (typeof existingTables)[number]) => table.tableNumber)
    );
    const numbersToCreate = normalizedTableNumbers.filter(
      (tableNumber) => !existingNumbers.has(tableNumber)
    );

    if (numbersToCreate.length > 0) {
      await prisma.table.createMany({
        data: numbersToCreate.map((tableNumber) => ({
          restaurantId: id,
          tableNumber,
          qrCodeToken: randomBytes(16).toString("hex"),
          active: true,
        })),
      });
    }

    if (numbersToCreate.length > 0) {
      revalidateAllRestaurantReadCaches();
    }

    return NextResponse.json({
      created: numbersToCreate,
      skipped: normalizedTableNumbers.filter((tableNumber) =>
        existingNumbers.has(tableNumber)
      ),
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not create tables", 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await getAdminAuthorized();
  if (!ok) return jsonError("Unauthorized", 401);

  const { id } = await params;

  try {
    const [tableCount, orderCount, rewardCount, requestCount] = await prisma.$transaction([
      prisma.table.count({
        where: { restaurantId: id },
      }),
      prisma.order.count({
        where: { restaurantId: id },
      }),
      prisma.orderReward.count({
        where: { restaurantId: id },
      }),
      prisma.staffRequest.count({
        where: { restaurantId: id },
      }),
    ]);

    const deleted = await prisma.table.deleteMany({
      where: { restaurantId: id },
    });

    if (deleted.count > 0) {
      revalidateAllRestaurantReadCaches();
    }

    return NextResponse.json({
      deleted: deleted.count,
      removed: {
        tables: tableCount,
        orders: orderCount,
        rewards: rewardCount,
        staffRequests: requestCount,
      },
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not remove tables", 500);
  }
}
