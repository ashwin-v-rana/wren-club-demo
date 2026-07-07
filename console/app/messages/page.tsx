"use client";

import { MessageSquare, Mail, Smartphone } from "lucide-react";
import { Panel, Pill, Empty } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { fmtDateTime } from "@/lib/format";
import type { OutboundMessage } from "@/lib/types";

function channelIcon(c: string) {
  if (c === "email") return <Mail size={14} />;
  if (c === "whatsapp") return <MessageSquare size={14} />;
  return <Smartphone size={14} />;
}

export default function MessagesPage() {
  const { data } = usePoll<{ messages: OutboundMessage[] }>("/api/messages");
  const messages = data?.messages ?? null;

  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div className="eyebrow">Proactive sends</div>
        <h1 style={{ fontSize: 28, marginTop: 4 }}>Outbound messages</h1>
      </div>

      {messages === null ? (
        <Panel><Empty>Loading…</Empty></Panel>
      ) : messages.length === 0 ? (
        <Panel><Empty>No outbound messages yet. Fire a proactive job from the Demo Control panel.</Empty></Panel>
      ) : (
        messages.map((m) => (
          <div key={m.message_id} className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--brass-deep)" }}>{channelIcon(m.channel)}</span>
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>{m.guest_name}</span>
                <Pill tone="brass">{m.trigger_type}</Pill>
                <Pill>{m.channel}</Pill>
              </div>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDateTime(m.sent_at)}</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.body}</div>
          </div>
        ))
      )}
    </div>
  );
}
