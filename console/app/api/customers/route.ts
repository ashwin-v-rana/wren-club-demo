import { NextRequest, NextResponse } from "next/server";
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

// Create a guest via the create_guest_profile SQL function (writes stay in SQL).
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let body: { name_given?: string; name_surname?: string; email?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("create_guest_profile", {
    p_name_given: body.name_given ?? "",
    p_name_surname: body.name_surname ?? "",
    p_email: body.email ?? "",
    p_phone: body.phone ?? "",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as { error?: string; status?: string; profile?: unknown };
  if (result.error === "NAME_REQUIRED") return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  if (result.error === "DUP_PHONE") return NextResponse.json({ error: "That phone number is already on file" }, { status: 409 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, profile: result.profile }, { status: 201 });
}
