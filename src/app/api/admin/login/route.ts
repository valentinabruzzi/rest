import { NextRequest, NextResponse } from "next/server";
import { createSessionToken } from "@/lib/session-token";
import { jsonError } from "@/lib/api-errors";

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SESSION_SECRET ?? process.env.STAFF_SESSION_SECRET;
  const pass = process.env.ADMIN_PASSWORD ?? process.env.STAFF_PASSWORD;
  if (!secret || !pass) {
    return jsonError("Admin login is not configured", 500);
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid body", 400);
  }

  if (body.password !== pass) {
    return jsonError("Invalid credentials", 401);
  }

  const token = createSessionToken("admin", secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400,
  });
  return res;
}
