import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/staff-auth";
import { revalidateMenuReadCaches } from "@/lib/data-cache";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export async function POST(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid category payload", 400);
  }

  try {
    const lastCategory = await prisma.category.findFirst({
      where: { restaurantId: session.restaurantId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const category = await prisma.category.create({
      data: {
        restaurantId: session.restaurantId,
        name: body.name.trim(),
        active: true,
        sortOrder: (lastCategory?.sortOrder ?? -1) + 1,
      },
      select: {
        id: true,
        name: true,
        active: true,
        sortOrder: true,
      },
    });

    revalidateMenuReadCaches();

    return NextResponse.json({ category });
  } catch (error) {
    console.error(error);
    return jsonError("Could not create category", 500);
  }
}
