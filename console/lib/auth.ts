import { SignJWT, jwtVerify } from "jose";
import type { SessionAgent } from "./types";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "");

export const SESSION_COOKIE = "wren_session";
export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

export async function signSession(agent: SessionAgent): Promise<string> {
  return await new SignJWT({ ...agent })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(SECRET);
}

export async function verifySession(token: string): Promise<SessionAgent | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      id: payload.id as string,
      email: payload.email as string,
      full_name: payload.full_name as string,
      role: payload.role as SessionAgent["role"],
      must_change_password: Boolean(payload.must_change_password),
    };
  } catch {
    return null;
  }
}
