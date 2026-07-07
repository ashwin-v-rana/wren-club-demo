import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

// OHIP shape: GET /rsv/v1/hotels/{hotelId}/roomTypes
// Read-only list used to populate the room-type picker when staff edit a
// reservation. Reads are allowed to select the table directly (server-side).
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("room_types")
    .select("room_type_code, display_name")
    .order("room_type_code", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roomTypes = (data ?? []).map((r) => ({ room_type_code: r.room_type_code, display_name: r.display_name }));
  return NextResponse.json({ roomTypes });
}
