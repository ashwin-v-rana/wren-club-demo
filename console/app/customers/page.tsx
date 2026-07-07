"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Panel, td, th, Empty } from "@/components/ui";
import { initials } from "@/lib/format";
import type { ProfileRow } from "@/lib/types";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<ProfileRow[] | null>(null);

  useEffect(() => {
    fetch("/api/customers").then((r) => r.json()).then((d) => setCustomers(d.customers ?? [])).catch(() => setCustomers([]));
  }, []);

  return (
    <div style={{ maxWidth: 1080 }}>
      <Panel title="Guests">
        {customers === null ? (
          <Empty>Loading…</Empty>
        ) : customers.length === 0 ? (
          <Empty>No guests on file. Run reset_demo() on the backend.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={th}>Guest</th>
                <th style={th}>Profile</th>
                <th style={th}>Email</th>
                <th style={th}>Phone</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.profile_id}>
                  <td style={td}>
                    <Link href={`/customers/${c.profile_id}`} style={{ display: "inline-flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
                      <span style={{ width: 34, height: 34, borderRadius: 999, background: "linear-gradient(135deg, var(--pine), var(--pine-soft))", color: "var(--cream)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-display)" }}>
                        {initials(c.name_given, c.name_surname)}
                      </span>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{c.name_given} {c.name_surname}</span>
                    </Link>
                  </td>
                  <td style={td}><span className="mono" style={{ color: "var(--text-muted)" }}>{c.profile_id}</span></td>
                  <td style={{ ...td, color: "var(--text-dim)" }}>{c.email ?? "—"}</td>
                  <td style={{ ...td, color: "var(--text-dim)" }}><span className="mono">{c.phone ?? "—"}</span></td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <Link href={`/customers/${c.profile_id}`} style={{ color: "var(--brass-deep)", display: "inline-flex" }}><ChevronRight size={18} /></Link>
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
