"use client";

import { useEffect, useState } from "react";
import { UserPlus, KeyRound, Trash2, X } from "lucide-react";
import { Panel, Pill, td, th, Empty } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { Agent, AgentRole } from "@/lib/types";

const ROLES: AgentRole[] = ["csr", "supervisor", "admin"];

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/admin/agents");
    const d = await r.json();
    setAgents(d.agents ?? []);
  }
  useEffect(() => { load(); }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    setErr(null);
    const r = await fetch(`/api/admin/agents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? "Update failed");
    await load();
  }

  async function resetPassword(a: Agent) {
    const pw = window.prompt(`Set a temporary password for ${a.full_name} (min 8 chars). They must change it on next login.`);
    if (!pw) return;
    setErr(null);
    const r = await fetch(`/api/admin/agents/${a.id}/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? "Reset failed");
    await load();
  }

  async function remove(a: Agent) {
    if (!window.confirm(`Delete ${a.full_name} <${a.email}>? This cannot be undone.`)) return;
    setErr(null);
    const r = await fetch(`/api/admin/agents/${a.id}`, { method: "DELETE" });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? "Delete failed");
    await load();
  }

  return (
    <div style={{ maxWidth: 1080, display: "flex", flexDirection: "column", gap: 16 }}>
      {err && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(165,63,43,0.10)", border: "1px solid rgba(165,63,43,0.35)", color: "#8f381f", fontSize: 13 }}>{err}</div>}

      {creating && <CreateForm onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} onError={setErr} />}

      <Panel
        title="Console staff"
        action={
          <button className="btn" onClick={() => setCreating((v) => !v)} style={{ padding: "8px 14px" }}>
            {creating ? <><X size={14} /> Close</> : <><UserPlus size={14} /> New agent</>}
          </button>
        }
      >
        {agents === null ? (
          <Empty>Loading…</Empty>
        ) : agents.length === 0 ? (
          <Empty>No staff accounts yet. Create the first admin with <span className="mono">npm run admin:create</span>.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Role</th>
                <th style={th}>Status</th>
                <th style={th}>Last login</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: "var(--ink)" }}>{a.full_name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.email}</div>
                  </td>
                  <td style={td}>
                    <select
                      value={a.role}
                      onChange={(e) => patch(a.id, { role: e.target.value })}
                      className="input"
                      style={{ width: "auto", padding: "6px 10px", fontSize: 12.5 }}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button className="btn-ghost" onClick={() => patch(a.id, { is_active: !a.is_active })} style={{ padding: "5px 10px", borderRadius: 999, fontSize: 11 }}>
                        {a.is_active ? <Pill tone="green">Active</Pill> : <Pill tone="danger">Inactive</Pill>}
                      </button>
                      {a.must_change_password && <Pill tone="brass">Must reset</Pill>}
                    </div>
                  </td>
                  <td style={{ ...td, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{a.last_login_at ? fmtDateTime(a.last_login_at) : "Never"}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn-ghost" onClick={() => resetPassword(a)} title="Reset password" style={{ padding: 7, borderRadius: 8, marginRight: 6 }}><KeyRound size={14} /></button>
                    <button className="btn-ghost" onClick={() => remove(a)} title="Delete" style={{ padding: 7, borderRadius: 8 }}><Trash2 size={14} /></button>
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

function CreateForm({ onClose, onCreated, onError }: { onClose: () => void; onCreated: () => void; onError: (e: string | null) => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AgentRole>("csr");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    const r = await fetch("/api/admin/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: fullName, role, password }),
    });
    setBusy(false);
    if (r.ok) onCreated();
    else onError((await r.json().catch(() => ({}))).error ?? "Could not create agent");
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr auto auto auto", gap: 12, alignItems: "end" }}>
      <L label="Full name"><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></L>
      <L label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></L>
      <L label="Role">
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as AgentRole)} style={{ width: "auto" }}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </L>
      <L label="Temp password"><input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></L>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn" disabled={busy} style={{ padding: "10px 16px" }}>{busy ? "Creating…" : "Create"}</button>
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
