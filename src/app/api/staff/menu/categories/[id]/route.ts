import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { getStaffSession } from "@/lib/staff-auth";
import { revalidateMenuReadCaches } from "@/lib/data-cache";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  const { id } = await params;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid category payload", 400);
  }

  try {
    const existing = await prisma.category.findFirst({
      where: {
        id,
        restaurantId: session.restaurantId,
      },
      select: { id: true },
    });

    if (!existing) {
      return jsonError("Category not found", 404);
    }

    const category = await prisma.category.update({
      where: { id },
      data: { name: body.name.trim() },
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
    return jsonError("Could not rename category", 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  const { id } = await params;

  try {
    const category = await prisma.category.findFirst({
      where: {
        id,
        restaurantId: session.restaurantId,
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      return jsonError("Category not found", 404);
    }

    await prisma.category.delete({
      where: { id },
    });

    revalidateMenuReadCaches();

    return NextResponse.json({
      ok: true,
      uncategorizedItems: category._count.products,
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not delete category", 500);
  }
}
