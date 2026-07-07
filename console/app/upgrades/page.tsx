"use client";

import { ArrowRight } from "lucide-react";
import { Panel, StatusPill, td, th, Empty } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { fmtDateTime } from "@/lib/format";
import type { UpgradeOffer } from "@/lib/types";

export default function UpgradesPage() {
  const { data } = usePoll<{ offers: UpgradeOffer[] }>("/api/opera/rsv/hotels/WRENLON/upgradeOffers");
  const offers = data?.offers ?? null;

  return (
    <div style={{ maxWidth: 1080 }}>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
