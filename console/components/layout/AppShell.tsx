"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { DemoControlPanel } from "../DemoControlPanel";

// Chrome-less screens (focused tasks): login and the change-password gate.
const BARE = new Set(["/login", "/change-password"]);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  if (BARE.has(pathname)) return <>{children}</>;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar />
        <main style={{ padding: 28, minWidth: 0, flex: 1 }}>{children}</main>
      </div>
      <DemoControlPanel />
    </div>
  );
}
