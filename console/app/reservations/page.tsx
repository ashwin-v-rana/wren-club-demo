"use client";

import { useState } from "react";
import { Panel, StatusPill, td, th, Empty } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { fmtDate } from "@/lib/format";
import type { Reservation } from "@/lib/types";

const FILTERS = ["All", "Reserved", "CheckedIn", "CheckedOut", "Cancelled"] as const;

export default function ReservationsPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const { data } = usePoll<{ reservations: Reservation[] }>("/api/opera/rsv/hotels/WRENLON/reservations");
  const all = data?.reservations ?? null;
  const rows = all && filter !== "All" ? all.filter((r) => r.reservation_status === filter) : all;

  return (
    <div style={{ maxWidth: 1120 }}>
      <Panel
        title="Reservations"
        action={
          <div style={{ display: "flex", gap: 6 }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={filter === f ? "btn" : "btn-ghost"}
                style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12 }}
              >
                {f}
              </button>
            ))}
          </div>
        }
      >
        {rows === null ? (
          <Empty>Loading…</Empty>
        ) : rows.length === 0 ? (
          <Empty>No reservations{filter !== "All" ? ` with status ${filter}` : ""}.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={th}>Guest</th>
                <th style={th}>Confirmation</th>
                <th style={th}>Room type</th>
                <th style={th}>Room</th>
                <th style={th}>Arrival</th>
                <th style={th}>Departure</th>
                <th style={th}>Guests</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.reservation_id}>
                  <td style={{ ...td, fontWeight: 600, color: "var(--ink)" }}>{r.guest_name}</td>
                  <td style={td}><span className="mono" style={{ fontSize: 12 }}>{r.confirmation_number}</span></td>
                  <td style={td}>{r.room_type_name}</td>
                  <td style={{ ...td, color: "var(--text-dim)" }}>{r.room_number ?? "—"}</td>
                  <td style={td}>{fmtDate(r.arrival_date)}</td>
                  <td style={td}>{fmtDate(r.departure_date)}</td>
                  <td style={{ ...td, color: "var(--text-dim)" }}>{r.adults}</td>
                  <td style={td}><StatusPill status={r.reservation_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
