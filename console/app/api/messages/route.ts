import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/admin-guard";
import { supabaseAdmin } from "@/lib/supabase-server";
import { guestNameOf } from "@/lib/join";

// Outbound messages log (proactive sends: pre-arrival upgrade, milestone, …).
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("outbound_messages")
    .select("message_id, profile_id, channel, trigger_type, body, sent_at, profiles(name_given, name_surname)")
    .order("sent_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = (data ?? []).map((m) => ({
    message_id: m.message_id,
    profile_id: m.profile_id,
    guest_name: guestNameOf(m.profiles),
    channel: m.channel,
    trigger_type: m.trigger_type,
    body: m.body,
    sent_at: m.sent_at,
  }));

  return NextResponse.json({ messages });
}
