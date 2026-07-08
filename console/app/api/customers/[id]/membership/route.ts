import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";

// Grant a Wren Club membership via grant_membership (writes stay in SQL — same
// one-contract rule as the AI agents). Idempotent: GRANTED / REACTIVATED /
// ALREADY_MEMBER / NOT_FOUND. Enrollment defaults to Europe/London "today" in
// the function; an optional enrollment_date backdates tenure (membership_years).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body: { enrollment_date?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine — enrollment defaults to today in SQL
  }

  const args: { p_profile_id: string; p_enrollment_date?: string } = { p_profile_id: id };
  if (body.enrollment_date) args.p_enrollment_date = body.enrollment_date;

  const { data, error } = await supabaseAdmin.rpc("grant_membership", args);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as { error?: string; status?: string; membership?: unknown };
  if (result.error === "NOT_FOUND") return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, status: result.status, membership: result.membership });
}
