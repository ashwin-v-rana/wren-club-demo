import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";
import type { AuthEvent } from "@/lib/types";

// Auth & Activity = the auth_events audit log written by the AI Auth Agent.
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data: events, error } = await supabaseAdmin
    .from("auth_events")
    .select("auth_event_id, profile_id, channel, event_type, result, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // auth_events has no FK to profiles (append-only log), so resolve names here.
  const ids = [...new Set((events ?? []).map((e) => e.profile_id).filter(Boolean))] as string[];
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("profile_id, name_given, name_surname")
      .in("profile_id", ids);
    for (const p of profiles ?? []) {
      names[p.profile_id] = `${p.name_given} ${p.name_surname}`;
    }
  }

  const enriched = (events as AuthEvent[]).map((e) => ({
    ...e,
    guest_name: e.profile_id ? names[e.profile_id] ?? null : null,
  }));

  return NextResponse.json({ events: enriched });
}
