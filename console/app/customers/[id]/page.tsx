"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, CalendarClock, Pencil, Trash2, X, Award } from "lucide-react";
import { StatTile, Panel, Pill, Empty } from "@/components/ui";
import { fmtDate, initials } from "@/lib/format";
import { useSessionAgent } from "@/hooks/useSessionAgent";
import type { EntitlementContext } from "@/lib/types";

export default function Guest360Page() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const [ctx, setCtx] = useState<EntitlementContext | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [granting, setGranting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { canWrite } = useSessionAgent();

  const load = useCallback(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCtx(d.context))
      .catch(() => setNotFound(true));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function del() {
    if (!window.confirm("Delete this guest? Only guests with no reservations or history can be removed.")) return;
    setErr(null);
    const r = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (r.ok) { router.push("/customers"); return; }
    setErr((await r.json().catch(() => ({}))).error ?? "Could not delete guest");
  }

  async function grant() {
    if (!window.confirm("Grant this guest a Wren Club membership, effective today?")) return;
    setErr(null);
    setGranting(true);
    const r = await fetch(`/api/customers/${id}/membership`, { method: "POST" });
    setGranting(false);
    if (r.ok) { load(); return; }
    setErr((await r.json().catch(() => ({}))).error ?? "Could not grant membership");
  }

  if (notFound) return <Empty>Guest not found.</Empty>;
  if (!ctx) return <Empty>Loading…</Empty>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1000 }}>
      <Link href="/customers" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-dim)", textDecoration: "none", fontSize: 13 }}>
        <ArrowLeft size={15} /> All guests
      </Link>

      {err && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(165,63,43,0.10)", border: "1px solid rgba(165,63,43,0.35)", color: "#8f381f", fontSize: 13 }}>{err}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ width: 60, height: 60, borderRadius: 999, background: "linear-gradient(135deg, var(--pine), var(--pine-soft))", color: "var(--cream)", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)" }}>
            {initials(ctx.name_given, ctx.name_surname)}
          </span>
          <div>
            <h1 style={{ fontSize: 30 }}>{ctx.name}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>{ctx.profile_id}</span>
              {ctx.is_member ? <Pill tone="brass">Member{ctx.membership_id ? ` · ${ctx.membership_id}` : ""}</Pill> : <Pill>Non-member</Pill>}
              {ctx.in_house && <Pill tone="green">In-house · Room {ctx.in_house_room}</Pill>}
            </div>
          </div>
        </div>
        {canWrite && (
          <div style={{ display: "flex", gap: 8 }}>
            {!ctx.is_member && (
              <button className="btn-ghost" onClick={grant} disabled={granting} style={{ padding: "8px 12px", borderRadius: 10, fontSize: 12.5 }}>
                <Award size={14} /> {granting ? "Granting…" : "Grant membership"}
              </button>
            )}
            <button className="btn-ghost" onClick={() => setEditing((v) => !v)} style={{ padding: "8px 12px", borderRadius: 10, fontSize: 12.5 }}>
              {editing ? <><X size={14} /> Close</> : <><Pencil size={14} /> Edit</>}
            </button>
            <button className="btn-ghost" onClick={del} style={{ padding: "8px 12px", borderRadius: 10, fontSize: 12.5 }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      </div>

      {editing && canWrite && (
        <EditGuest ctx={ctx} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} onError={setErr} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <StatTile label="Membership" value={ctx.is_member ? `${ctx.membership_years} yr` : "—"} hint={ctx.is_member ? "Years enrolled" : "Not a member"} />
        <StatTile label="Stays this year" value={ctx.stays_this_year} hint="Checked-out stays" />
        <StatTile label="Upcoming" value={ctx.upcoming_stay ? 1 : 0} hint={ctx.upcoming_stay ? "Reservation on file" : "None booked"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="Contact" pad={20}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Row icon={<Mail size={15} />} label="Email" value={ctx.email ?? "—"} />
            <Row icon={<Phone size={15} />} label="Phone" value={ctx.phone ?? "—"} mono />
          </div>
        </Panel>

        <Panel title="Upcoming stay" pad={20}>
          {ctx.upcoming_stay ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Row icon={<CalendarClock size={15} />} label="Arrival" value={fmtDate(ctx.upcoming_stay.arrival_date)} />
              <Row icon={<CalendarClock size={15} />} label="Departure" value={fmtDate(ctx.upcoming_stay.departure_date)} />
              <Row label="Room type" value={ctx.upcoming_stay.room_type} />
              <Row label="Confirmation" value={ctx.upcoming_stay.confirmation_number} mono />
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No upcoming reservation.</div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function EditGuest({ ctx, onClose, onSaved, onError }: { ctx: EntitlementContext; onClose: () => void; onSaved: () => void; onError: (e: string | null) => void }) {
  const [given, setGiven] = useState(ctx.name_given);
  const [surname, setSurname] = useState(ctx.name_surname);
  const [email, setEmail] = useState(ctx.email ?? "");
  const [phone, setPhone] = useState(ctx.phone ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const r = await fetch(`/api/customers/${ctx.profile_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_given: given, name_surname: surname, email, phone }),
    });
    setBusy(false);
    if (r.ok) onSaved();
    else onError((await r.json().catch(() => ({}))).error ?? "Could not update guest");
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
      <L label="First name"><input className="input" value={given} onChange={(e) => setGiven(e.target.value)} required /></L>
      <L label="Surname"><input className="input" value={surname} onChange={(e) => setSurname(e.target.value)} required /></L>
      <L label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></L>
      <L label="Phone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44…" /></L>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn" disabled={busy} style={{ padding: "10px 16px" }}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="btn-ghost" onClick={onClose} style={{ padding: "10px 14px", borderRadius: 10 }}>Cancel</button>
      </div>
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

function Row({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text-dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
        {icon}{label}
      </span>
      <span className={mono ? "mono" : undefined} style={{ color: "var(--ink)", fontWeight: 600, fontSize: 13.5 }}>{value}</span>
    </div>
  );
}
