import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-errors";
import { getStaffSession } from "@/lib/staff-auth";
import { publishStaffRealtimeEvent } from "@/lib/staff-events";
import { isPrismaTemporarilyUnavailable } from "@/lib/prisma-errors";

const patchSchema = z.object({
  status: z.enum(["in_progress", "closed"]),
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
    return jsonError("Invalid body", 400);
  }

  const request = await prisma.staffRequest.findFirst({
    where: {
      id,
      restaurantId: session.restaurantId,
    },
  });
  if (!request) return jsonError("Request not found", 404);

  const allowed: Record<string, string[]> = {
    new: ["in_progress", "closed"],
    in_progress: ["closed"],
    closed: [],
  };

  if (!allowed[request.status]?.includes(body.status)) {
    return jsonError("Invalid request transition", 400);
  }

  try {
    const updated = await prisma.staffRequest.update({
      where: { id },
      data: {
        status: body.status,
        closedAt: body.status === "closed" ? new Date() : null,
      },
    });

    publishStaffRealtimeEvent({
      type: "requests-updated",
      restaurantId: session.restaurantId,
      requestId: updated.id,
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      closedAt: updated.closedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error(error);
    if (isPrismaTemporarilyUnavailable(error)) {
      return jsonError("Temporary database issue", 503);
    }
    return jsonError("Could not update request", 500);
  }
}
