import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

// Fires the milestone thank-you (defaults to Thompson P1001, the 3-stays member).
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let profileId = "P1001";
  try {
    const body = await req.json();
    if (body?.profile_id) profileId = String(body.profile_id);
  } catch {
    // no body -> default persona
  }

  const { data, error } = await supabaseAdmin.rpc("fire_milestone", { p_profile_id: profileId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
