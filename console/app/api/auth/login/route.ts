import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPassword } from "@/lib/auth-server";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import type { AgentRole } from "@/lib/types";

type AgentRow = {
  id: string;
  email: string;
  full_name: string;
  role: AgentRole;
  is_active: boolean;
  must_change_password: boolean;
  password_hash: string;
};

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("agents")
      .select("id, email, full_name, role, is_active, must_change_password, password_hash")
      .eq("email", String(email).toLowerCase())
      .eq("is_active", true)
      .maybeSingle<AgentRow>();

    if (error || !data) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await verifyPassword(password, data.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    void supabaseAdmin.from("agents").update({ last_login_at: new Date().toISOString() }).eq("id", data.id);

    const token = await signSession({
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      must_change_password: data.must_change_password,
    });

    const response = NextResponse.json({ ok: true, must_change_password: data.must_change_password });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (e) {
    console.error("login error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
