"use client";

import { useState } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StatusPill } from "@/components/Modal";
import { api, fetcher } from "@/lib/api";
import { useApp } from "@/lib/store";

interface Project { id: string; name: string; code: string; status: string; _count?: { members: number } }

const STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"];

export default function ProjectsPage() {
  const { refreshProjects } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const { data, mutate, isLoading } = useSWR<{ items: Project[] }>("/projects", fetcher);

  async function create(v: Record<string, string>) {
    await api.post("/projects", { name: v.name, code: v.code, status: v.status || "PLANNING" });
    await mutate();
    await refreshProjects(); // update the topbar project switcher
  }

  const items = data?.items ?? [];

  return (
    <Shell>
      <PageHeader
        title="Projects"
        subtitle={`${items.length} project(s)`}
        action={<button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ New Project</button>}
      />

      {isLoading ? (
        <div className="center-msg">Loading…</div>
      ) : (
        <div className="table-card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Code</th><th>Status</th><th>Members</th></tr></thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={4}><div className="empty">No projects yet — create the first one.</div></td></tr>
                ) : items.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ color: "#64748b", fontSize: 12 }}>{p.code}</td>
                    <td><StatusPill value={p.status} /></td>
                    <td>{p._count?.members ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <Modal
          title="Create Project"
          fields={[
            { name: "name", label: "Name", required: true, placeholder: "Dubai Metro Phase 4" },
            { name: "code", label: "Code", required: true, placeholder: "DMPH4" },
            { name: "status", label: "Status", type: "select", options: STATUSES.map((s) => ({ value: s, label: s })) },
          ]}
          onClose={() => setShowCreate(false)}
          onSubmit={create}
        />
      )}
    </Shell>
  );
}
