import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";

// Page-level guard. API routes enforce their own auth (requireAuth/requireAdmin).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const agent = token ? await verifySession(token) : null;

  if (pathname === "/login") {
    if (agent) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  if (!agent) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Force a password change before anything else.
  if (agent.must_change_password && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  // Admin-only areas.
  if (pathname.startsWith("/admin") && agent.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|wren-logo.svg).*)"],
};
