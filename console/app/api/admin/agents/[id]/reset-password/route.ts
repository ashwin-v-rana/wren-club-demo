import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";
import { hashPassword } from "@/lib/auth-server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password = body.password;
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const password_hash = await hashPassword(password);
  const { data: updated, error } = await supabaseAdmin
    .from("agents")
    .update({ password_hash, must_change_password: true })
    .eq("id", id)
    .select("id, email, full_name")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Agent not found" }, { status: error ? 500 : 404 });
  }
  return NextResponse.json({ ok: true, agent: updated });
}
