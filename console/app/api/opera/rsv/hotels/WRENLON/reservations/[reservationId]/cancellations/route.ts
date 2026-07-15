import { NextRequest, NextResponse } from "next/server";
import { requireWriter } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

// OHIP shape: POST /rsv/v1/hotels/{hotelId}/reservations/{reservationId}/cancellations
// Thin wrapper over cancel_reservation (idempotent guarded transition — only
// Reserved cancels, and only a real transition releases inventory).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ reservationId: string }> }) {
  const auth = await requireWriter();
  if (!auth.ok) return auth.response;
  const { reservationId } = await params;

  const { data, error } = await supabaseAdmin.rpc("cancel_reservation", { p_reservation_id: reservationId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as { status?: string };
  if (result.status === "NOT_FOUND") return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  if (result.status === "NOT_CANCELLABLE") {
    return NextResponse.json({ error: "Only a reserved (not yet checked-in) booking can be cancelled" }, { status: 409 });
  }
  // CANCELLED and ALREADY_CANCELLED are both success (idempotent).
  return NextResponse.json({ ok: true, status: result.status });
}
