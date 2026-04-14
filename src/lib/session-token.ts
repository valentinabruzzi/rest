import { createHmac, timingSafeEqual } from "crypto";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

type SessionRole = "staff" | "admin";

export type SessionPayload = {
  role: SessionRole;
  exp: number;
  restaurantId?: string | null;
  restaurantSlug?: string | null;
  restaurantName?: string | null;
  restaurantLogoUrl?: string | null;
  restaurantPrimaryColor?: string | null;
  restaurantSecondaryColor?: string | null;
  restaurantTheme?: unknown | null;
  restaurantSettings?: unknown | null;
};

export function createSessionToken(
  role: SessionRole,
  secret: string,
  extra: Omit<Partial<SessionPayload>, "role" | "exp"> = {},
  maxAgeMs: number = 86400000
): string {
  const body = JSON.stringify({
    role,
    exp: Date.now() + maxAgeMs,
    ...extra,
  });
  const payload = Buffer.from(body, "utf8").toString("base64url");
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export function readSessionToken(
  token: string | undefined,
  secret: string | undefined,
  role: SessionRole
): SessionPayload | null {
  if (!token || !secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload, secret);
  try {
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (parsed.role !== role) return null;
  if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
  return parsed;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  role: SessionRole
): boolean {
  return readSessionToken(token, secret, role) !== null;
}
