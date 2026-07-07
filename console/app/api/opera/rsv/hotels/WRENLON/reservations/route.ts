import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";
import { guestNameOf } from "@/lib/join";

// OHIP shape: GET /rsv/v1/hotels/{hotelId}/reservations
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const status = req.nextUrl.searchParams.get("status");

  const { data: rt } = await supabaseAdmin.from("room_types").select("room_type_code, display_name");
  const rtMap = Object.fromEntries((rt ?? []).map((r) => [r.room_type_code, r.display_name]));

  let q = supabaseAdmin
    .from("reservations")
    .select(
      "reservation_id, confirmation_number, profile_id, room_type_code, room_number, arrival_date, departure_date, adults, reservation_status, profiles(name_given, name_surname)"
    )
    .order("arrival_date", { ascending: true });
  if (status) q = q.eq("reservation_status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reservations = (data ?? []).map((r) => ({
    reservation_id: r.reservation_id,
    confirmation_number: r.confirmation_number,
    profile_id: r.profile_id,
    guest_name: guestNameOf(r.profiles),
    room_type_code: r.room_type_code,
    room_type_name: rtMap[r.room_type_code] ?? r.room_type_code,
    room_number: r.room_number,
    arrival_date: r.arrival_date,
    departure_date: r.departure_date,
    adults: r.adults,
    reservation_status: r.reservation_status,
  }));

  return NextResponse.json({ reservations });
}
