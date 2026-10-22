import { NextResponse } from "next/server";
import { requireWriter } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

// Demo control: top up room inventory + spa slots without touching existing data.
export async function POST() {
  const auth = await requireWriter();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin.rpc("extend_demo_inventory");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
