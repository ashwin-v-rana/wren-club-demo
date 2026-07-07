"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ShieldX } from "lucide-react";
import { Panel, Pill, td, th, Empty } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { AuthEvent } from "@/lib/types";

type Row = AuthEvent & { guest_name: string | null };

export default function ActivityPage() {
  const [events, setEvents] = useState<Row[] | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch("/api/activity").then((r) => r.json()).then((d) => { if (!stop) setEvents(d.events ?? []); }).catch(() => {});
    load();
    // Live-ish: refresh every 4s (no manual refresh).
    const t = setInterval(load, 4000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  return (
    <div style={{ maxWidth: 1080 }}>
      <Panel title="Auth & Activity" action={<span className="eyebrow">Auto-refreshing</span>}>
        {events === null ? (
          <Empty>Loading…</Empty>
        ) : events.length === 0 ? (
          <Empty>No authentication events yet. They appear here as the AI agents verify guests.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={th}>Guest</th>
                <th style={th}>Event</th>
                <th style={th}>Channel</th>
                <th style={th}>Result</th>
                <th style={th}>When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.auth_event_id}>
                  <td style={td}>
                    <span style={{ fontWeight: 600 }}>{e.guest_name ?? e.profile_id ?? <span style={{ color: "var(--text-muted)" }}>Unknown</span>}</span>
                    {e.profile_id && <span className="mono" style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>{e.profile_id}</span>}
                  </td>
                  <td style={td}><span className="mono" style={{ fontSize: 12 }}>{e.event_type}</span></td>
                  <td style={{ ...td, color: "var(--text-dim)" }}>{e.channel ?? "—"}</td>
                  <td style={td}>
                    {e.result === "success" ? (
                      <Pill tone="green"><BadgeCheck size={13} /> success</Pill>
                    ) : (
                      <Pill tone="danger"><ShieldX size={13} /> failure</Pill>
                    )}
                  </td>
                  <td style={{ ...td, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDateTime(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
