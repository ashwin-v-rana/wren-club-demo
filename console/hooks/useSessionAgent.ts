"use client";

import { useEffect, useState } from "react";
import type { SessionAgent } from "@/lib/types";

export function useSessionAgent() {
  const [agent, setAgent] = useState<SessionAgent | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setAgent((d.agent ?? null) as SessionAgent | null);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // canWrite gates write UI. Gated on `loaded` so we never briefly flash write
  // controls to a read-only viewer before /api/auth/me resolves. Cosmetic only —
  // the server (requireWriter) is the real boundary.
  return {
    agent,
    loaded,
    isAdmin: agent?.role === "admin",
    canWrite: loaded && agent != null && agent.role !== "viewer",
  };
}
