import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPassword, hashPassword } from "@/lib/auth-server";
import { verifySession, signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: "Session expired" }, { status: 401 });

    const { current_password, new_password } = await req.json();
    if (!current_password || !new_password) {
      return NextResponse.json({ error: "Current and new password required" }, { status: 400 });
    }
    if (typeof new_password !== "string" || new_password.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("agents")
      .select("id, password_hash, is_active")
      .eq("id", session.id)
      .maybeSingle<{ id: string; password_hash: string; is_active: boolean }>();

    if (error || !data || !data.is_active) {
      return NextResponse.json({ error: "Account unavailable" }, { status: 401 });
    }

    const valid = await verifyPassword(current_password, data.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    const new_hash = await hashPassword(new_password);
    const { error: updateError } = await supabaseAdmin
      .from("agents")
      .update({ password_hash: new_hash, must_change_password: false })
      .eq("id", session.id);

    if (updateError) {
      return NextResponse.json({ error: "Could not update password" }, { status: 500 });
    }

    const newToken = await signSession({
      id: session.id,
      email: session.email,
      full_name: session.full_name,
      role: session.role,
      must_change_password: false,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (e) {
    console.error("change-password error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
