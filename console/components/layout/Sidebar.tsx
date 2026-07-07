"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BedDouble, ConciergeBell, Sparkles, ArrowUpCircle, MessageSquare, Users, ShieldCheck, UserCog } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSessionAgent } from "@/hooks/useSessionAgent";

type Item = { to: string; icon: LucideIcon; label: string; adminOnly?: boolean };
const ITEMS: Item[] = [
  { to: "/", icon: LayoutDashboard, label: "Overview" },
  { to: "/reservations", icon: BedDouble, label: "Reservations" },
  { to: "/service-requests", icon: ConciergeBell, label: "Service Requests" },
  { to: "/spa", icon: Sparkles, label: "Spa" },
  { to: "/upgrades", icon: ArrowUpCircle, label: "Upgrade Offers" },
  { to: "/messages", icon: MessageSquare, label: "Messages" },
  { to: "/customers", icon: Users, label: "Customers" },
  { to: "/activity", icon: ShieldCheck, label: "Auth & Activity" },
  { to: "/admin/agents", icon: UserCog, label: "Agents", adminOnly: true },
];

const CREAM = "#f4ecdd";
const CREAM_DIM = "rgba(244, 236, 221, 0.62)";
const BRASS = "#c9a86a";

export function Sidebar() {
  const pathname = usePathname() ?? "/";
  const { isAdmin } = useSessionAgent();
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        minHeight: "100vh",
        background: "linear-gradient(180deg, #1a3a32, #122a24)",
        borderRight: "1px solid rgba(176, 141, 87, 0.28)",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        padding: "18px 0",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "6px 20px 18px", borderBottom: "1px solid rgba(176, 141, 87, 0.22)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wren-logo.svg" alt="The Wren" width={72} height={72} />
        <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, letterSpacing: "0.02em", color: CREAM, lineHeight: 1 }}>
          THE WREN
        </div>
        <div style={{ fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, color: BRASS }}>
          Front Desk Console
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", padding: "14px 0", gap: 2 }}>
        {items.map(({ to, icon: Icon, label }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              href={to}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 13,
                padding: "11px 22px",
                color: active ? CREAM : CREAM_DIM,
                borderLeft: `3px solid ${active ? BRASS : "transparent"}`,
                background: active ? "linear-gradient(90deg, rgba(201, 168, 106, 0.16), transparent)" : "transparent",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: active ? 700 : 500,
              }}
            >
              <Icon size={18} color={active ? BRASS : CREAM_DIM} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div style={{ marginTop: "auto", padding: "14px 22px", borderTop: "1px solid rgba(176, 141, 87, 0.22)" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontSize: 9.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: BRASS,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 999, background: BRASS, boxShadow: `0 0 8px ${BRASS}` }} />
          Demo
        </span>
      </div>
    </aside>
  );
}
