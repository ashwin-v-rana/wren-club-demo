import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";
import { guestNameOf } from "@/lib/join";

// OHIP shape: GET /fof/v1/hotels/{hotelId}/serviceRequests
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data: rc } = await supabaseAdmin.from("request_codes").select("code, description");
  const descMap = Object.fromEntries((rc ?? []).map((r) => [r.code, r.description]));

  const { data, error } = await supabaseAdmin
    .from("service_requests")
    .select(
      "service_request_id, code, status, priority, department, profile_id, room, pre_arrival, quantity, open_date, comment, completion_date, profiles(name_given, name_surname)"
    )
    .order("open_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const requests = (data ?? []).map((r) => ({
    service_request_id: r.service_request_id,
    code: r.code,
    description: descMap[r.code] ?? r.code,
    status: r.status,
    priority: r.priority,
    department: r.department,
    profile_id: r.profile_id,
    guest_name: guestNameOf(r.profiles),
    room: r.room,
    pre_arrival: r.pre_arrival,
    quantity: r.quantity,
    open_date: r.open_date,
    comment: r.comment,
    completion_date: r.completion_date,
  }));

  return NextResponse.json({ requests });
}
