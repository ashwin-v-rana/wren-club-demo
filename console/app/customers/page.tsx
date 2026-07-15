"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, UserPlus, X } from "lucide-react";
import { Panel, td, th, Empty } from "@/components/ui";
import { initials } from "@/lib/format";
import { useSessionAgent } from "@/hooks/useSessionAgent";
import type { ProfileRow } from "@/lib/types";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<ProfileRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { canWrite } = useSessionAgent();

  async function load() {
    const r = await fetch("/api/customers");
    const d = await r.json();
    setCustomers(d.customers ?? []);
  }
  useEffect(() => { load(); }, []);

  return (
    <div style={{ maxWidth: 1080, display: "flex", flexDirection: "column", gap: 16 }}>
      {err && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(165,63,43,0.10)", border: "1px solid rgba(165,63,43,0.35)", color: "#8f381f", fontSize: 13 }}>{err}</div>}

      {creating && canWrite && <CreateGuest onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} onError={setErr} />}

      <Panel
        title="Guests"
        action={
          canWrite ? (
            <button className="btn" onClick={() => setCreating((v) => !v)} style={{ padding: "8px 14px" }}>
              {creating ? <><X size={14} /> Close</> : <><UserPlus size={14} /> New guest</>}
            </button>
          ) : null
        }
      >
        {customers === null ? (
          <Empty>Loading…</Empty>
        ) : customers.length === 0 ? (
          <Empty>No guests on file. Run reset_demo() or add one.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={th}>Guest</th>
                <th style={th}>Profile</th>
                <th style={th}>Email</th>
                <th style={th}>Phone</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.profile_id}>
                  <td style={td}>
                    <Link href={`/customers/${c.profile_id}`} style={{ display: "inline-flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
                      <span style={{ width: 34, height: 34, borderRadius: 999, background: "linear-gradient(135deg, var(--pine), var(--pine-soft))", color: "var(--cream)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                        {initials(c.name_given, c.name_surname)}
                      </span>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{c.name_given} {c.name_surname}</span>
                    </Link>
                  </td>
                  <td style={td}><span className="mono" style={{ color: "var(--text-muted)" }}>{c.profile_id}</span></td>
                  <td style={{ ...td, color: "var(--text-dim)" }}>{c.email ?? "—"}</td>
                  <td style={{ ...td, color: "var(--text-dim)" }}><span className="mono">{c.phone ?? "—"}</span></td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <Link href={`/customers/${c.profile_id}`} style={{ color: "var(--brass-deep)", display: "inline-flex" }}><ChevronRight size={18} /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function CreateGuest({ onClose, onCreated, onError }: { onClose: () => void; onCreated: () => void; onError: (e: string | null) => void }) {
  const [given, setGiven] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const r = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name_given: given, name_surname: surname, email, phone }),
    });
    setBusy(false);
    if (r.ok) onCreated();
    else onError((await r.json().catch(() => ({}))).error ?? "Could not create guest");
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
      <L label="First name"><input className="input" value={given} onChange={(e) => setGiven(e.target.value)} required /></L>
      <L label="Surname"><input className="input" value={surname} onChange={(e) => setSurname(e.target.value)} required /></L>
      <L label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></L>
      <L label="Phone"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44…" /></L>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn" disabled={busy} style={{ padding: "10px 16px" }}>{busy ? "Adding…" : "Add"}</button>
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
