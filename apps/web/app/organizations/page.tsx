"use client";

import { useState } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StatusPill } from "@/components/Modal";
import { api, fetcher } from "@/lib/api";

interface Org {
  id: string;
  name: string;
  type: string;
  country: string | null;
}

const TYPES = ["CLIENT", "CONSULTANT", "CONTRACTOR", "SUBCONTRACTOR", "SUPPLIER", "OTHER"];

export default function OrganizationsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { data, mutate, isLoading } = useSWR<{ items: Org[] }>("/organizations", fetcher);

  async function create(v: Record<string, string>) {
    await api.post("/organizations", {
      name: v.name,
      type: v.type || "OTHER",
      country: v.country || undefined,
    });
    await mutate();
  }

  const items = data?.items ?? [];

  return (
    <Shell>
      <PageHeader
        title="Organizations"
        subtitle={`${items.length} organisation(s) in this tenant`}
        action={<button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ New Organization</button>}
      />

      {isLoading ? (
        <div className="center-msg">Loading…</div>
      ) : (
        <div className="table-card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Country</th></tr></thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={3}><div className="empty">No organisations yet — create the first one.</div></td></tr>
                ) : items.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.name}</td>
                    <td><StatusPill value={o.type} /></td>
                    <td>{o.country ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <Modal
          title="Create Organization"
          fields={[
            { name: "name", label: "Name", required: true, placeholder: "Acme Civil Division" },
            { name: "type", label: "Type", type: "select", options: TYPES.map((t) => ({ value: t, label: t })) },
            { name: "country", label: "Country (ISO-2)", placeholder: "AE" },
          ]}
          onClose={() => setShowCreate(false)}
          onSubmit={create}
        />
      )}
    </Shell>
  );
}
