"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, BadgeCheck } from "lucide-react";
import { StatTile, Panel, Pill, td, Empty } from "@/components/ui";
import { fmtRelative } from "@/lib/format";
import type { ProfileRow, AuthEvent } from "@/lib/types";

type ActivityRow = AuthEvent & { guest_name: string | null };

export default function OverviewPage() {
  const [customers, setCustomers] = useState<ProfileRow[]>([]);
  const [events, setEvents] = useState<ActivityRow[]>([]);

  useEffect(() => {
    fetch("/api/customers").then((r) => r.json()).then((d) => setCustomers(d.customers ?? [])).catch(() => {});
    fetch("/api/activity").then((r) => r.json()).then((d) => setEvents(d.events ?? [])).catch(() => {});
  }, []);

  const successes = events.filter((e) => e.result === "success").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 1080 }}>
      <div>
        <div className="eyebrow">The Wren Hotel &amp; Members&apos; Club · London</div>
        <h1 style={{ fontSize: 34, marginTop: 4 }}>Good day. Here is the front desk.</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <StatTile label="Guests on file" value={customers.length} hint="Profiles in OPERA" />
        <StatTile label="Recent auth events" value={events.length} hint={`${successes} successful`} />
        <StatTile label="Console" value="Live" hint="Reading the OPERA-mimicking backend" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="Guests" action={<Link href="/customers" className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12 }}>View all</Link>}>
          {customers.length === 0 ? (
            <Empty>No guests loaded. Run reset_demo() on the backend.</Empty>
          ) : (
            <table>
              <tbody>
                {customers.slice(0, 5).map((c) => (
                  <tr key={c.profile_id}>
                    <td style={td}>
                      <Link href={`/customers/${c.profile_id}`} style={{ fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}>
                        {c.name_given} {c.name_surname}
                      </Link>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}><span className="mono" style={{ color: "var(--text-muted)" }}>{c.profile_id}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Auth & Activity" action={<Link href="/activity" className="btn-ghost" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12 }}>View log</Link>}>
          {events.length === 0 ? (
            <Empty>No authentication events yet.</Empty>
          ) : (
            <table>
              <tbody>
                {events.slice(0, 5).map((e) => (
                  <tr key={e.auth_event_id}>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {e.result === "success" ? <BadgeCheck size={15} color="var(--pine)" /> : <ShieldCheck size={15} color="#8f381f" />}
                        <span style={{ fontWeight: 600 }}>{e.guest_name ?? e.profile_id ?? "Unknown"}</span>
                      </span>
                    </td>
                    <td style={td}><Pill tone={e.result === "success" ? "green" : "danger"}>{e.event_type}</Pill></td>
                    <td style={{ ...td, textAlign: "right", color: "var(--text-muted)" }}>{fmtRelative(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
