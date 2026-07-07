"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, KeyRound } from "lucide-react";
import { useSessionAgent } from "@/hooks/useSessionAgent";

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/reservations": "Reservations",
  "/service-requests": "Service Requests",
  "/spa": "Spa",
  "/upgrades": "Upgrade Offers",
  "/messages": "Outbound Messages",
  "/customers": "Customers",
  "/activity": "Auth & Activity",
  "/admin/agents": "Agents",
};

export function TopBar() {
  const pathname = usePathname() ?? "/";
  const { agent } = useSessionAgent();

  const title = /^\/customers\/[^/]+$/.test(pathname) ? "Guest 360" : TITLES[pathname] ?? "The Wren";

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  return (
    <header
      style={{
        height: 62,
        background: "rgba(251, 247, 238, 0.85)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        position: "sticky",
        top: 0,
        zIndex: 5,
      }}
    >
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 26, color: "var(--ink)" }}>{title}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--pine)", boxShadow: "0 0 8px rgba(26,58,50,0.5)" }} />
          Live
        </span>
        {agent && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "right", lineHeight: 1.15 }}>
              <div style={{ color: "var(--ink)", fontWeight: 600, fontSize: 13 }}>{agent.full_name}</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700 }}>
                {agent.role}
              </div>
            </div>
            <Link href="/change-password" title="Change password" aria-label="Change password" className="btn-ghost" style={{ padding: 8, borderRadius: 8, display: "inline-flex" }}>
              <KeyRound size={14} />
            </Link>
            <button onClick={handleLogout} title="Sign out" aria-label="Sign out" className="btn-ghost" style={{ padding: 8, borderRadius: 8, display: "inline-flex" }}>
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
