"use client";

import { useState } from "react";
import { Mail, Lock, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (res.ok) {
        // Hard navigation so middleware re-evaluates with the fresh session
        // cookie (a forced-change account will be routed to /change-password).
        window.location.replace("/");
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Login failed");
        setLoading(false);
      }
    } catch {
      setError("Network error — please try again");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 420, padding: 36 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 26 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wren-logo.svg" alt="The Wren" width={64} height={64} />
          <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, letterSpacing: "0.02em", color: "var(--ink)", lineHeight: 1 }}>
            THE WREN
          </div>
          <div className="eyebrow">Front Desk Console · Demo</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field icon={<Mail size={14} />} label="Email" type="email" value={email} onChange={setEmail} autoFocus autoComplete="email" />
          <Field icon={<Lock size={14} />} label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />

          {error && <ErrorBox>{error}</ErrorBox>}

          <button type="submit" className="btn" disabled={loading || !email || !password} style={{ marginTop: 6, padding: "12px 16px", textTransform: "uppercase" }}>
            {loading ? "Signing in…" : (<>Sign in <ArrowRight size={14} /></>)}
          </button>
        </form>

        <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
          Authorized Wren staff only. Access is logged.
        </div>
      </div>
    </div>
  );
}

export function Field({
  icon, label, type, value, onChange, autoFocus, autoComplete,
}: {
  icon?: React.ReactNode; label: string; type: string; value: string;
  onChange: (v: string) => void; autoFocus?: boolean; autoComplete?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 700 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--cream-2)", border: "1px solid var(--border-2)", borderRadius: 10, padding: "10px 12px", color: "var(--text-dim)" }}>
        {icon}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          required
          autoComplete={autoComplete}
          style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--text)", fontSize: 14, fontFamily: "var(--font-body)" }}
        />
      </div>
    </label>
  );
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(165,63,43,0.10)", border: "1px solid rgba(165,63,43,0.35)", color: "#8f381f", fontSize: 12 }}>
      {children}
    </div>
  );
}
