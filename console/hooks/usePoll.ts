"use client";

import { useEffect, useState } from "react";

// Poll an endpoint on an interval so boards update with no manual refresh
// (the core demo beat: a service request appearing live during a call).
export function usePoll<T>(url: string, ms = 3000): { data: T | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumping this triggers an immediate out-of-cycle refetch (used after a write
  // action so the board reflects the change without waiting for the next tick).
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch(url)
        .then((r) => r.json())
        .then((d) => { if (!stop) { setData(d); setLoading(false); } })
        .catch(() => { if (!stop) setLoading(false); });
    load();
    const t = setInterval(load, ms);
    return () => { stop = true; clearInterval(t); };
  }, [url, ms, nonce]);

  return { data, loading, refresh: () => setNonce((n) => n + 1) };
}
