import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getAdminAuthorized } from "@/lib/staff-auth";

const patchSchema = z.object({
  active: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  sortOrder: z.number().int().optional(),
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

  if (Object.keys(body).length === 0) return jsonError("No changes", 400);

  try {
    const c = await prisma.category.update({
      where: { id },
      data: body,
    });
    return NextResponse.json({
      id: c.id,
      name: c.name,
      active: c.active,
      sortOrder: c.sortOrder,
    });
  } catch {
    return jsonError("Category not found", 404);
  }
}
