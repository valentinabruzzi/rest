import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getAdminAuthorized } from "@/lib/staff-auth";

const createSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional().default(""),
  price: z.number().int().min(0),
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
    return jsonError("Invalid product payload", 400);
  }

  try {
    const category = await prisma.category.findFirst({
      where: {
        id: body.categoryId,
        restaurantId: id,
      },
      select: {
        id: true,
      },
    });

    if (!category) {
      return jsonError("Category not found", 404);
    }

    const lastProduct = await prisma.product.findFirst({
      where: { restaurantId: id, categoryId: body.categoryId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const product = await prisma.product.create({
      data: {
        restaurantId: id,
        categoryId: body.categoryId,
        name: body.name.trim(),
        description: body.description.trim(),
        price: body.price,
        active: true,
        allergens: [],
        tags: [],
        sortOrder: (lastProduct?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({
      id: product.id,
      name: product.name,
      price: product.price,
      active: product.active,
    });
  } catch (error) {
    console.error(error);
    return jsonError("Could not create product", 500);
  }
}
