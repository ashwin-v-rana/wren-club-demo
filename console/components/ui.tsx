import type { ReactNode } from "react";

export function Panel({ title, action, children, pad = 0 }: { title?: string; action?: ReactNode; children: ReactNode; pad?: number }) {
  return (
    <section className="card" style={{ overflow: "hidden" }}>
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          {title && <h3 style={{ fontSize: 18 }}>{title}</h3>}
          {action}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div className="eyebrow">{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 600, color: "var(--ink)", lineHeight: 1.1, marginTop: 6 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brass" | "green" | "danger" }) {
  const tones: Record<string, { bg: string; fg: string; bd: string }> = {
    neutral: { bg: "var(--cream-2)", fg: "var(--text-dim)", bd: "var(--border-2)" },
    brass: { bg: "rgba(176,141,87,0.14)", fg: "var(--brass-deep)", bd: "rgba(176,141,87,0.4)" },
    green: { bg: "rgba(26,58,50,0.10)", fg: "var(--pine)", bd: "rgba(26,58,50,0.28)" },
    danger: { bg: "rgba(165,63,43,0.12)", fg: "#8f381f", bd: "rgba(165,63,43,0.35)" },
  };
  const t = tones[tone];
  return <span className="pill" style={{ background: t.bg, color: t.fg, borderColor: t.bd }}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{children}</div>;
}

export const th: React.CSSProperties = {
  textAlign: "left",
  padding: "11px 20px",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontWeight: 700,
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

export const td: React.CSSProperties = {
  padding: "13px 20px",
  fontSize: 13,
  color: "var(--text)",
  borderBottom: "1px solid var(--border)",
};
