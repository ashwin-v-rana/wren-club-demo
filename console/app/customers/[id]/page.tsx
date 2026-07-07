"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, CalendarClock } from "lucide-react";
import { StatTile, Panel, Pill, Empty } from "@/components/ui";
import { fmtDate, initials } from "@/lib/format";
import type { EntitlementContext } from "@/lib/types";

export default function Guest360Page() {
  const params = useParams();
  const id = String(params.id);
  const [ctx, setCtx] = useState<EntitlementContext | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCtx(d.context))
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) return <Empty>Guest not found.</Empty>;
  if (!ctx) return <Empty>Loading…</Empty>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1000 }}>
      <Link href="/customers" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-dim)", textDecoration: "none", fontSize: 13 }}>
        <ArrowLeft size={15} /> All guests
      </Link>

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
