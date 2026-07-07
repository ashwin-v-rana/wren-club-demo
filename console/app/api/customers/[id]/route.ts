import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

// Guest 360 = the same get_entitlement_context the AI agents read (one contract,
// two clients). Computed in SQL: membership_years, stays_this_year, upcoming_stay.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data, error } = await supabaseAdmin.rpc("get_entitlement_context", { p_profile_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || (data as { error?: string }).error) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }
  return NextResponse.json({ context: data });
}

// Edit a guest via update_guest_profile (writes stay in SQL).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body: { name_given?: string; name_surname?: string; email?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("update_guest_profile", {
    p_profile_id: id,
    p_name_given: body.name_given ?? "",
    p_name_surname: body.name_surname ?? "",
    p_email: body.email ?? "",
    p_phone: body.phone ?? "",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as { error?: string; profile?: unknown };
  if (result.error === "NOT_FOUND") return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  if (result.error === "NAME_REQUIRED") return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  if (result.error === "DUP_PHONE") return NextResponse.json({ error: "That phone number is already on file" }, { status: 409 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, profile: result.profile });
}

// Delete a guest via delete_guest_profile (blocked if the guest has any history).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { data, error } = await supabaseAdmin.rpc("delete_guest_profile", { p_profile_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as { error?: string; status?: string };
  if (result.error === "NOT_FOUND") return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  if (result.error === "HAS_DEPENDENTS") {
    return NextResponse.json(
      { error: "This guest has reservations or history and can't be deleted.", detail: data },
      { status: 409 }
    );
  }
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
