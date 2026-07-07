import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";
import { guestNameOf, one } from "@/lib/join";

// OHIP shape: GET /lms/v1/hotels/{hotelId}/activityBookings
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("activity_bookings")
    .select(
      "activity_booking_id, profile_id, activity_type_code, booking_date, booking_time, status, profiles(name_given, name_surname), activity_types(display_name)"
    )
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bookings = (data ?? []).map((b) => ({
    activity_booking_id: b.activity_booking_id,
    profile_id: b.profile_id,
    guest_name: guestNameOf(b.profiles),
    activity_type_code: b.activity_type_code,
    activity_name: one(b.activity_types as { display_name?: string })?.display_name ?? b.activity_type_code,
    booking_date: b.booking_date,
    booking_time: b.booking_time,
    status: b.status,
  }));

  return NextResponse.json({ bookings });
}
