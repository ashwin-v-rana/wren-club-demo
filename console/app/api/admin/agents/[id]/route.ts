import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body: { full_name?: string; role?: string; is_active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.full_name === "string") patch.full_name = body.full_name.trim();
  if (typeof body.role === "string") {
    if (!["csr", "supervisor", "admin"].includes(body.role)) {
      return NextResponse.json({ error: "role must be csr, supervisor, or admin" }, { status: 400 });
    }
    if (id === auth.agent.id && body.role !== "admin") {
      return NextResponse.json({ error: "You cannot demote yourself" }, { status: 400 });
    }
    patch.role = body.role;
  }
  if (typeof body.is_active === "boolean") {
    if (id === auth.agent.id && !body.is_active) {
      return NextResponse.json({ error: "You cannot deactivate yourself" }, { status: 400 });
    }
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from("agents")
    .update(patch)
    .eq("id", id)
    .select("id, email, full_name, role, is_active, must_change_password, last_login_at, created_at")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Agent not found" }, { status: error ? 500 : 404 });
  }
  return NextResponse.json({ ok: true, agent: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  if (id === auth.agent.id) {
    return NextResponse.json({ error: "You cannot delete yourself" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("agents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
