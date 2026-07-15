"use client";

import { useState } from "react";
import { SlidersHorizontal, X, RotateCcw, ChevronRight, Send } from "lucide-react";
import { useSessionAgent } from "@/hooks/useSessionAgent";

type Result = { label: string; ok: boolean; text: string } | null;

export function DemoControlPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const { canWrite } = useSessionAgent();

  // Every control here is a write — read-only viewers don't see the panel at all.
  if (!canWrite) return null;

  async function run(label: string, url: string, body?: unknown, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(label);
    setResult(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      setResult({ label, ok: res.ok, text: res.ok ? "Done" : data.error ?? "Failed" });
    } catch {
      setResult({ label, ok: false, text: "Network error" });
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn"
        style={{ position: "fixed", right: 22, bottom: 22, zIndex: 40, padding: "11px 16px", boxShadow: "0 12px 30px rgba(26,58,50,0.28)" }}
      >
        <SlidersHorizontal size={15} /> Demo Control
      </button>
    );
  }

  return (
    <div
      className="card"
      style={{ position: "fixed", right: 22, bottom: 22, zIndex: 40, width: 300, padding: 0, background: "linear-gradient(180deg, #1a3a32, #122a24)", border: "1px solid rgba(176,141,87,0.4)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid rgba(176,141,87,0.28)" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "#f4ecdd" }}>Demo Control</span>
        <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "transparent", border: 0, color: "#c9a86a", cursor: "pointer", display: "inline-flex" }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        <Group title="Reset">
          <DarkBtn busy={busy} label="Reset demo" icon={<RotateCcw size={13} />} onClick={() => run("Reset demo", "/api/demo/reset", undefined, "Reset the demo? This truncates and reseeds all transactional data.")} />
        </Group>

        <Group title="Advance">
          <DarkBtn busy={busy} label="Complete blanket request" icon={<ChevronRight size={13} />} onClick={() => run("Complete blanket request", "/api/demo/advance", { step: "complete_blanket_request" })} />
          <DarkBtn busy={busy} label="Check in Thompson" icon={<ChevronRight size={13} />} onClick={() => run("Check in Thompson", "/api/demo/advance", { step: "check_in_thompson" })} />
          <DarkBtn busy={busy} label="Expire offers" icon={<ChevronRight size={13} />} onClick={() => run("Expire offers", "/api/demo/advance", { step: "expire_offers" })} />
        </Group>

        <Group title="Proactive jobs">
          <DarkBtn busy={busy} label="Fire pre-arrival job" icon={<Send size={13} />} onClick={() => run("Fire pre-arrival job", "/api/demo/fire-pre-arrival")} />
          <DarkBtn busy={busy} label="Fire milestone job" icon={<Send size={13} />} onClick={() => run("Fire milestone job", "/api/demo/fire-milestone")} />
        </Group>

        {result && (
          <div style={{ fontSize: 12, color: result.ok ? "#c9a86a" : "#e8a08c", padding: "8px 10px", background: "rgba(0,0,0,0.18)", borderRadius: 8 }}>
            {result.label}: {result.text}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: "rgba(244,236,221,0.5)", lineHeight: 1.4 }}>
          Boards refresh automatically. Sends are logged to Outbound messages (delivery is wired in Talkdesk).
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, color: "#c9a86a" }}>{title}</span>
      {children}
    </div>
  );
}

function DarkBtn({ label, icon, onClick, busy }: { label: string; icon: React.ReactNode; onClick: () => void; busy: string | null }) {
  const isBusy = busy === label;
  return (
    <button
      onClick={onClick}
      disabled={!!busy}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 11px",
        borderRadius: 8,
        border: "1px solid rgba(176,141,87,0.3)",
        background: isBusy ? "rgba(176,141,87,0.22)" : "rgba(255,255,255,0.04)",
        color: "#f4ecdd",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: busy ? "wait" : "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ color: "#c9a86a", display: "inline-flex" }}>{icon}</span>
      {isBusy ? "Working…" : label}
    </button>
  );
}
