"use client";

import { MapPin, Clock } from "lucide-react";
import { Pill, Empty } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { fmtDateTime } from "@/lib/format";
import type { ServiceRequest } from "@/lib/types";

const COLUMNS: { key: ServiceRequest["status"]; label: string }[] = [
  { key: "Open", label: "Open" },
  { key: "InProgress", label: "In Progress" },
  { key: "Completed", label: "Completed" },
];

export default function ServiceRequestsPage() {
  const { data } = usePoll<{ requests: ServiceRequest[] }>("/api/opera/fof/hotels/WRENLON/serviceRequests");
  const requests = data?.requests ?? null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 28 }}>Service Requests</h1>
        <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--pine)", boxShadow: "0 0 8px rgba(26,58,50,0.5)" }} />
          Live
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, alignItems: "start" }}>
        {COLUMNS.map((col) => {
          const items = (requests ?? []).filter((r) => r.status === col.key);
          return (
            <div key={col.key} className="card" style={{ padding: 0, background: "var(--surface-2)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", letterSpacing: "0.02em" }}>{col.label}</span>
                <Pill>{items.length}</Pill>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, minHeight: 80 }}>
                {requests === null ? (
                  <Empty>Loading…</Empty>
                ) : items.length === 0 ? (
                  <div style={{ padding: "18px 8px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>None</div>
                ) : (
                  items.map((r) => <RequestCard key={r.service_request_id} r={r} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RequestCard({ r }: { r: ServiceRequest }) {
  return (
    <div className="card" style={{ padding: 14, boxShadow: "none" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: 13.5 }}>
          {r.description}
          {r.quantity > 1 && <span style={{ color: "var(--text-muted)", fontWeight: 500 }}> ×{r.quantity}</span>}
        </div>
        <Pill tone="brass">{r.department}</Pill>
      </div>
      <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-dim)" }}>{r.guest_name}</div>
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 14, fontSize: 11.5, color: "var(--text-muted)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> Room {r.room}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Clock size={12} /> {fmtDateTime(r.completion_date ?? r.open_date)}
        </span>
      </div>
      {r.comment && (
        <div style={{ marginTop: 8, padding: "7px 10px", background: "var(--cream-2)", borderRadius: 8, fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>
          “{r.comment}”
        </div>
      )}
    </div>
  );
}
