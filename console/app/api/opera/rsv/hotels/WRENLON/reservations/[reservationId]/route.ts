import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

// OHIP shape: PUT /rsv/v1/hotels/{hotelId}/reservations/{reservationId}
// Thin wrapper over put_reservation — the same set-difference claim/release
// function the AI agents call (one contract, two clients). All params are
// optional; put_reservation coalesces omitted fields to the existing booking.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ reservationId: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { reservationId } = await params;

  let body: { arrival_date?: string; departure_date?: string; room_type_code?: string; adults?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("put_reservation", {
    p_reservation_id: reservationId,
    p_arrival: body.arrival_date ?? null,
    p_departure: body.departure_date ?? null,
    p_room_type_code: body.room_type_code ?? null,
    p_adults: body.adults ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Success returns the raw reservation row (no `error` key); failure returns { error }.
  const result = data as { error?: string };
  if (result.error === "NOT_FOUND") return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  if (result.error === "NOT_MODIFIABLE") return NextResponse.json({ error: "A cancelled reservation can't be modified" }, { status: 409 });
  if (result.error === "INVALID_DATES") return NextResponse.json({ error: "Departure must be after arrival" }, { status: 400 });
  if (result.error === "ROOM_TYPE_NOT_FOUND") return NextResponse.json({ error: "Unknown room type" }, { status: 400 });
  if (result.error === "NO_AVAILABILITY") return NextResponse.json({ error: "No availability for the requested change" }, { status: 409 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, reservation: data });
}
