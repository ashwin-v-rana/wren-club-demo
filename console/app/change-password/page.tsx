"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ShieldAlert, Lock } from "lucide-react";
import type { SessionAgent } from "@/lib/types";
import { Field, ErrorBox } from "../login/page";

export default function ChangePasswordPage() {
  const [agent, setAgent] = useState<SessionAgent | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setAgent(d.agent ?? null)).catch(() => setAgent(null));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError("New password must be at least 8 characters");
    if (next !== confirm) return setError("New password and confirmation don't match");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      if (res.ok) {
        // Hard navigation: the session cookie just changed, so force a fresh
        // server round-trip (avoids a stale RSC cache + middleware redirect loop).
        window.location.replace("/");
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not change password");
        setLoading(false);
      }
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  }

  const forced = agent?.must_change_password === true;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 460, padding: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: "linear-gradient(135deg, var(--brass), var(--brass-deep))", display: "grid", placeItems: "center", color: "#fff" }}>
            {forced ? <ShieldAlert size={20} /> : <Lock size={20} />}
          </div>
          <div>
            <h2 style={{ fontSize: 24 }}>{forced ? "Set a new password" : "Change password"}</h2>
            <div className="eyebrow" style={{ marginTop: 4 }}>The Wren · Front Desk Console</div>
          </div>
        </div>

        {forced && (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(176,141,87,0.12)", border: "1px solid rgba(176,141,87,0.35)", color: "var(--text)", fontSize: 13, marginBottom: 18, lineHeight: 1.45 }}>
            Your password was set by an administrator. Please change it before continuing.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Current password" type="password" value={current} onChange={setCurrent} autoFocus autoComplete="current-password" />
          <Field label="New password" type="password" value={next} onChange={setNext} autoComplete="new-password" />
          <Field label="Confirm new password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />

          {error && <ErrorBox>{error}</ErrorBox>}

          <button type="submit" className="btn" disabled={loading || !current || !next || !confirm} style={{ marginTop: 6, padding: "12px 16px", textTransform: "uppercase" }}>
            {loading ? "Updating…" : (<>Update password <ArrowRight size={14} /></>)}
          </button>
        </form>
      </div>
    </div>
  );
}
