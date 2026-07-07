"use client";

import { Panel, StatusPill, td, th, Empty } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { fmtDate } from "@/lib/format";
import type { SpaBooking } from "@/lib/types";

function prettyTime(t: string): string {
  // t is "HH:MM:SS"; render as h:MM AM/PM.
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

export default function SpaPage() {
  const { data } = usePoll<{ bookings: SpaBooking[] }>("/api/opera/lms/hotels/WRENLON/activityBookings");
  const bookings = data?.bookings ?? null;

  const byDate = new Map<string, SpaBooking[]>();
  for (const b of bookings ?? []) {
    if (!byDate.has(b.booking_date)) byDate.set(b.booking_date, []);
    byDate.get(b.booking_date)!.push(b);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <div style={{ maxWidth: 1000, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div className="eyebrow">Cowshed Spa</div>
        <h1 style={{ fontSize: 28, marginTop: 4 }}>Spa bookings</h1>
      </div>

      {bookings === null ? (
        <Panel><Empty>Loading…</Empty></Panel>
      ) : dates.length === 0 ? (
        <Panel><Empty>No spa bookings on file.</Empty></Panel>
      ) : (
        dates.map((d) => (
          <Panel key={d} title={fmtDate(d)}>
            <table>
              <thead>
                <tr>
                  <th style={th}>Time</th>
                  <th style={th}>Guest</th>
                  <th style={th}>Treatment</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {byDate.get(d)!.map((b) => (
                  <tr key={b.activity_booking_id}>
                    <td style={{ ...td, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>{prettyTime(b.booking_time)}</td>
                    <td style={td}>{b.guest_name}</td>
                    <td style={td}>{b.activity_name}</td>
                    <td style={td}><StatusPill status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ))
      )}
    </div>
  );
}
