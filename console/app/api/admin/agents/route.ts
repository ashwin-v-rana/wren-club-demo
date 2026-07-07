import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";
import { hashPassword } from "@/lib/auth-server";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("id, email, full_name, role, is_active, must_change_password, last_login_at, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: { email?: string; full_name?: string; role?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const full_name = body.full_name?.trim();
  const role = body.role?.trim();
  const password = body.password;

  if (!email || !full_name || !role || !password) {
    return NextResponse.json({ error: "email, full_name, role, and password are required" }, { status: 400 });
  }
  if (!["csr", "supervisor", "admin"].includes(role)) {
    return NextResponse.json({ error: "role must be csr, supervisor, or admin" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin.from("agents").select("id").ilike("email", email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "An agent with this email already exists" }, { status: 409 });
  }

  const password_hash = await hashPassword(password);
  const { data: created, error } = await supabaseAdmin
    .from("agents")
    .insert({ email, full_name, role, password_hash, must_change_password: true })
    .select("id, email, full_name, role, is_active, must_change_password, last_login_at, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, agent: created }, { status: 201 });
}
