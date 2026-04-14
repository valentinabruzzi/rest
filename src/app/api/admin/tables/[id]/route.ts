import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getAdminAuthorized } from "@/lib/staff-auth";

const patchSchema = z.object({
  active: z.boolean().optional(),
  regenerateToken: z.boolean().optional(),
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

  const data: { active?: boolean; qrCodeToken?: string } = {};
  if (body.active !== undefined) data.active = body.active;
  if (body.regenerateToken) {
    data.qrCodeToken = randomBytes(16).toString("hex");
  }

  if (Object.keys(data).length === 0) {
    return jsonError("No changes", 400);
  }

  try {
    const t = await prisma.table.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      id: t.id,
      tableNumber: t.tableNumber,
      qrCodeToken: t.qrCodeToken,
      active: t.active,
    });
  } catch {
    return jsonError("Table not found", 404);
  }
}
