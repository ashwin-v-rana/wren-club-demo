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
