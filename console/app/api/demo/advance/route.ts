import { NextRequest, NextResponse } from "next/server";
import { requireWriter } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

const STEPS = new Set(["complete_blanket_request", "check_in_thompson", "expire_offers"]);

export async function POST(req: NextRequest) {
  const auth = await requireWriter();
  if (!auth.ok) return auth.response;

  let body: { step?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const step = body.step;
  if (!step || !STEPS.has(step)) {
    return NextResponse.json({ error: "Unknown demo step" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("advance_demo", { p_step: step });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
