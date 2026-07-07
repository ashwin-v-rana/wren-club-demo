import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "./auth";
import type { SessionAgent } from "./types";

type Guard =
  | { ok: true; agent: SessionAgent }
  | { ok: false; response: NextResponse };

// Any authenticated staff user.
export async function requireAuth(): Promise<Guard> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const agent = await verifySession(token);
  if (!agent) {
    return { ok: false, response: NextResponse.json({ error: "Session expired" }, { status: 401 }) };
  }
  return { ok: true, agent };
}

// Admin-only endpoints (agent management, resets).
export async function requireAdmin(): Promise<Guard> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  if (auth.agent.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Admin role required" }, { status: 403 }) };
  }
  return auth;
}
