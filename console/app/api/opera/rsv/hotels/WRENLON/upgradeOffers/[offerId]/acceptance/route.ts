import { NextRequest, NextResponse } from "next/server";
import { requireWriter } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

// POST /rsv/.../upgradeOffers/{offerId}/acceptance
// Thin wrapper over accept_upgrade_offer — the same claim-new-inventory-first
// function the AI agents call. Idempotent; the guest is never stranded (on
// NO_AVAILABILITY the offer stays Offered and the reservation is untouched).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ offerId: string }> }) {
  const auth = await requireWriter();
  if (!auth.ok) return auth.response;
  const { offerId } = await params;

  const { data, error } = await supabaseAdmin.rpc("accept_upgrade_offer", { p_offer_id: offerId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as { status?: string };
  if (result.status === "NOT_FOUND") return NextResponse.json({ error: "Upgrade offer not found" }, { status: 404 });
  if (result.status === "NO_AVAILABILITY") {
    return NextResponse.json({ error: "No availability in the upgraded room type — offer left open" }, { status: 409 });
  }
  if (result.status === "EXPIRED") return NextResponse.json({ error: "This offer has expired" }, { status: 409 });
  if (result.status === "DECLINED") return NextResponse.json({ error: "This offer was declined by the guest" }, { status: 409 });
  // ACCEPTED and ALREADY_ACCEPTED are both success (idempotent).
  return NextResponse.json({ ok: true, status: result.status, result: data });
}
