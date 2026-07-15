import { NextResponse } from "next/server";
import { requireWriter } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

// Fires the proactive pre-arrival upgrade job: logs a PRE_ARRIVAL_UPGRADE row
// into outbound_messages for member reservations arriving within the window.
export async function POST() {
  const auth = await requireWriter();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin.rpc("fire_pre_arrival_upgrade", {
    p_hotel_id: "WRENLON",
    p_days_ahead: 14,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
