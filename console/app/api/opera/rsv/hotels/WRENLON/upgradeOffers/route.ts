import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";
import { guestNameOf } from "@/lib/join";

// Upgrade offers (state table backing accept_upgrade_offer).
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data: rt } = await supabaseAdmin.from("room_types").select("room_type_code, display_name");
  const rtMap = Object.fromEntries((rt ?? []).map((r) => [r.room_type_code, r.display_name]));

  const { data, error } = await supabaseAdmin
    .from("upgrade_offers")
    .select("offer_id, profile_id, from_room_type, to_room_type, status, offered_at, expires_at, responded_at, profiles(name_given, name_surname)")
    .order("offered_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const offers = (data ?? []).map((o) => ({
    offer_id: o.offer_id,
    profile_id: o.profile_id,
    guest_name: guestNameOf(o.profiles),
    from_room_type: o.from_room_type,
    from_name: rtMap[o.from_room_type] ?? o.from_room_type,
    to_room_type: o.to_room_type,
    to_name: rtMap[o.to_room_type] ?? o.to_room_type,
    status: o.status,
    offered_at: o.offered_at,
    expires_at: o.expires_at,
    responded_at: o.responded_at,
  }));

  return NextResponse.json({ offers });
}
