import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { jsonError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { isPrismaTemporarilyUnavailable } from "@/lib/prisma-errors";
import { getStaffSession } from "@/lib/staff-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getStaffSession();
  if (!session) return jsonError("Unauthorized", 401);

  try {
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);

    return NextResponse.json(
      {
        ok: true,
        mode: "normal",
        checkedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    if (isPrismaTemporarilyUnavailable(error)) {
      return NextResponse.json(
        {
          ok: false,
          mode: "temporary",
          checkedAt: new Date().toISOString(),
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    console.error(error);
    return jsonError("Failed to check staff network status", 500);
  }
}
