"use client";

import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { Panel, StatusPill, td, th, Empty } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { useSessionAgent } from "@/hooks/useSessionAgent";
import { fmtDate } from "@/lib/format";
import type { Reservation, RoomType } from "@/lib/types";

const FILTERS = ["All", "Reserved", "CheckedIn", "CheckedOut", "Cancelled"] as const;

// put_reservation modifies any non-Cancelled booking; only Reserved cancels.
const isEditable = (s: Reservation["reservation_status"]) => s !== "Cancelled" && s !== "CheckedOut" && s !== "NoShow";

export default function ReservationsPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const { data, refresh } = usePoll<{ reservations: Reservation[] }>("/api/opera/rsv/hotels/WRENLON/reservations");
  const all = data?.reservations ?? null;
  const rows = all && filter !== "All" ? all.filter((r) => r.reservation_status === filter) : all;

  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const { canWrite } = useSessionAgent();

  useEffect(() => {
    fetch("/api/opera/rsv/hotels/WRENLON/roomTypes")
      .then((r) => r.json())
      .then((d) => setRoomTypes(d.roomTypes ?? []))
      .catch(() => {});
  }, []);

  async function cancel(r: Reservation) {
    if (!window.confirm(`Cancel ${r.guest_name}'s reservation (${r.confirmation_number})? Inventory will be released.`)) return;
    setErr(null);
    setBusy(r.reservation_id);
    const res = await fetch(`/api/opera/rsv/hotels/WRENLON/reservations/${r.reservation_id}/cancellations`, { method: "POST" });
    setBusy(null);
    if (res.ok) { refresh(); return; }
    setErr((await res.json().catch(() => ({}))).error ?? "Could not cancel reservation");
  }

  return (
    <div style={{ maxWidth: 1120, display: "flex", flexDirection: "column", gap: 16 }}>
      {err && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(165,63,43,0.10)", border: "1px solid rgba(165,63,43,0.35)", color: "#8f381f", fontSize: 13 }}>{err}</div>
      )}

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
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <FragmentRow
                  key={r.reservation_id}
                  r={r}
                  canWrite={canWrite}
                  editing={editing === r.reservation_id}
                  busy={busy === r.reservation_id}
                  roomTypes={roomTypes}
                  onEdit={() => { setErr(null); setEditing(editing === r.reservation_id ? null : r.reservation_id); }}
                  onCancel={() => cancel(r)}
                  onSaved={() => { setEditing(null); refresh(); }}
                  onError={setErr}
                />
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function FragmentRow({
  r, canWrite, editing, busy, roomTypes, onEdit, onCancel, onSaved, onError,
}: {
  r: Reservation;
  canWrite: boolean;
  editing: boolean;
  busy: boolean;
  roomTypes: RoomType[];
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
  onError: (e: string | null) => void;
}) {
  return (
    <>
      <tr>
        <td style={{ ...td, fontWeight: 600, color: "var(--ink)" }}>{r.guest_name}</td>
        <td style={td}><span className="mono" style={{ fontSize: 12 }}>{r.confirmation_number}</span></td>
        <td style={td}>{r.room_type_name}</td>
        <td style={{ ...td, color: "var(--text-dim)" }}>{r.room_number ?? "—"}</td>
        <td style={td}>{fmtDate(r.arrival_date)}</td>
        <td style={td}>{fmtDate(r.departure_date)}</td>
        <td style={{ ...td, color: "var(--text-dim)" }}>{r.adults}</td>
        <td style={td}><StatusPill status={r.reservation_status} /></td>
        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
          {canWrite && isEditable(r.reservation_status) ? (
            <div style={{ display: "inline-flex", gap: 6 }}>
              <button className="btn-ghost" onClick={onEdit} disabled={busy} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12 }}>
                {editing ? <><X size={13} /> Close</> : <><Pencil size={13} /> Edit</>}
              </button>
              {r.reservation_status === "Reserved" && (
                <button className="btn-ghost" onClick={onCancel} disabled={busy} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, color: "#8f381f" }}>
                  {busy ? "…" : "Cancel"}
                </button>
              )}
            </div>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          )}
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={9} style={{ padding: 0, borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <EditReservation r={r} roomTypes={roomTypes} onSaved={onSaved} onError={onError} />
          </td>
        </tr>
      )}
    </>
  );
}

function EditReservation({
  r, roomTypes, onSaved, onError,
}: {
  r: Reservation;
  roomTypes: RoomType[];
  onSaved: () => void;
  onError: (e: string | null) => void;
}) {
  const [roomType, setRoomType] = useState(r.room_type_code);
  const [arrival, setArrival] = useState(r.arrival_date.slice(0, 10));
  const [departure, setDeparture] = useState(r.departure_date.slice(0, 10));
  const [adults, setAdults] = useState(r.adults);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const res = await fetch(`/api/opera/rsv/hotels/WRENLON/reservations/${r.reservation_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_type_code: roomType, arrival_date: arrival, departure_date: departure, adults }),
    });
    setBusy(false);
    if (res.ok) onSaved();
    else onError((await res.json().catch(() => ({}))).error ?? "Could not update reservation");
  }

  const options = roomTypes.length ? roomTypes : [{ room_type_code: r.room_type_code, display_name: r.room_type_name }];

  return (
    <form onSubmit={submit} style={{ padding: 18, display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 0.7fr auto", gap: 12, alignItems: "end" }}>
      <L label="Room type">
        <select className="input" value={roomType} onChange={(e) => setRoomType(e.target.value)}>
          {options.map((o) => <option key={o.room_type_code} value={o.room_type_code}>{o.display_name}</option>)}
        </select>
      </L>
      <L label="Arrival"><input className="input" type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} required /></L>
      <L label="Departure"><input className="input" type="date" value={departure} onChange={(e) => setDeparture(e.target.value)} required /></L>
      <L label="Guests"><input className="input" type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} /></L>
      <button type="submit" className="btn" disabled={busy} style={{ padding: "10px 16px" }}>{busy ? "Saving…" : "Save changes"}</button>
    </form>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, color: "var(--text-dim)" }}>{label}</span>
      {children}
    </label>
  );
}
