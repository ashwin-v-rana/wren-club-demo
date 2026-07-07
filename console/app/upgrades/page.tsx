"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Panel, StatusPill, td, th, Empty } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { fmtDateTime } from "@/lib/format";
import type { UpgradeOffer } from "@/lib/types";

export default function UpgradesPage() {
  const { data, refresh } = usePoll<{ offers: UpgradeOffer[] }>("/api/opera/rsv/hotels/WRENLON/upgradeOffers");
  const offers = data?.offers ?? null;

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function accept(o: UpgradeOffer) {
    if (!window.confirm(`Accept ${o.guest_name}'s upgrade to ${o.to_name}? Their reservation will move room type.`)) return;
    setErr(null);
    setBusy(o.offer_id);
    const res = await fetch(`/api/opera/rsv/hotels/WRENLON/upgradeOffers/${o.offer_id}/acceptance`, { method: "POST" });
    setBusy(null);
    if (res.ok) { refresh(); return; }
    setErr((await res.json().catch(() => ({}))).error ?? "Could not accept upgrade");
  }

  return (
    <div style={{ maxWidth: 1080, display: "flex", flexDirection: "column", gap: 16 }}>
      {err && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(165,63,43,0.10)", border: "1px solid rgba(165,63,43,0.35)", color: "#8f381f", fontSize: 13 }}>{err}</div>
      )}

      <Panel title="Upgrade offers">
        {offers === null ? (
          <Empty>Loading…</Empty>
        ) : offers.length === 0 ? (
          <Empty>No upgrade offers on file.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={th}>Guest</th>
                <th style={th}>Upgrade</th>
                <th style={th}>Status</th>
                <th style={th}>Offered</th>
                <th style={th}>Expires</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.offer_id}>
                  <td style={{ ...td, fontWeight: 600, color: "var(--ink)" }}>{o.guest_name}</td>
                  <td style={td}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "var(--text-dim)" }}>{o.from_name}</span>
                      <ArrowRight size={14} color="var(--brass-deep)" />
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{o.to_name}</span>
                    </span>
                  </td>
                  <td style={td}><StatusPill status={o.status} /></td>
                  <td style={{ ...td, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDateTime(o.offered_at)}</td>
                  <td style={{ ...td, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDateTime(o.expires_at)}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {o.status === "Offered" ? (
                      <button className="btn" onClick={() => accept(o)} disabled={busy === o.offer_id} style={{ padding: "6px 14px", fontSize: 12 }}>
                        {busy === o.offer_id ? "Accepting…" : "Accept"}
                      </button>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
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
