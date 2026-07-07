import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

// Customers = guest profiles (the OPERA-mimicking `profiles` table).
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("profile_id, name_given, name_surname, email, phone, created_at")
    .order("profile_id", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers: data });
}
