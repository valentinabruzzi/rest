import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getAdminAuthorized } from "@/lib/staff-auth";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
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
    return jsonError("Invalid category payload", 400);
  }

  try {
    const lastCategory = await prisma.category.findFirst({
      where: { restaurantId: id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const category = await prisma.category.create({
      data: {
        restaurantId: id,
        name: body.name.trim(),
        active: true,
        sortOrder: (lastCategory?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      active: category.active,
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not create category", 500);
  }
}
