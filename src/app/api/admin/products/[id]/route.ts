import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getAdminAuthorized } from "@/lib/staff-auth";

const patchSchema = z.object({
  active: z.boolean().optional(),
  price: z.number().int().min(0).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await getAdminAuthorized();
  if (!ok) return jsonError("Unauthorized", 401);

  const { id } = await params;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return jsonError("Invalid body", 400);
  }

  if (Object.keys(body).length === 0) {
    return jsonError("No changes", 400);
  }

  try {
    const p = await prisma.product.update({
      where: { id },
      data: body,
    });
    return NextResponse.json({
      id: p.id,
      active: p.active,
      price: p.price,
      name: p.name,
    });
  } catch {
    return jsonError("Product not found", 404);
  }
}
