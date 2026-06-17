"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StatusPill, type Field } from "@/components/Modal";
import { api, fetcher } from "@/lib/api";
import { useApp } from "@/lib/store";

interface Org { id: string; name: string }
interface Project {
  id: string;
  name: string;
  code: string;
  status: string;
  ownerOrgId: string | null;
  ownerOrg: { id: string; name: string } | null;
  _count?: { members: number };
}

const STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"];

export default function ProjectsPage() {
  const { refreshProjects } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const { data, mutate, isLoading } = useSWR<{ items: Project[] }>("/projects", fetcher);
  const { data: orgs } = useSWR<{ items: Org[] }>("/organizations", fetcher);

  const orgOptions = (orgs?.items ?? []).map((o) => ({ value: o.id, label: o.name }));
  const hasOrgs = orgOptions.length > 0;

  const createFields: Field[] = [
    { name: "name", label: "Project name", required: true, placeholder: "Dubai Metro Phase 4" },
    { name: "code", label: "Code", required: true, placeholder: "DMPH4" },
    { name: "ownerOrgId", label: "Organization (owner)", type: "select", required: true, options: orgOptions },
    { name: "status", label: "Status", type: "select", options: STATUSES.map((s) => ({ value: s, label: s })) },
  ];

  const editFields: Field[] = [
    { name: "name", label: "Project name", required: true },
    { name: "ownerOrgId", label: "Organization (owner)", type: "select", options: orgOptions },
    { name: "status", label: "Status", type: "select", options: STATUSES.map((s) => ({ value: s, label: s })) },
  ];

  async function create(v: Record<string, string>) {
    await api.post("/projects", {
      name: v.name,
      code: v.code,
      ownerOrgId: v.ownerOrgId,
      status: v.status || "PLANNING",
    });
    await mutate();
    await refreshProjects();
  }

  async function update(v: Record<string, string>) {
    const payload: Record<string, string> = {};
    if (v.name) payload.name = v.name;
    if (v.status) payload.status = v.status;
    if (v.ownerOrgId) payload.ownerOrgId = v.ownerOrgId;
    await api.patch(`/projects/${editing!.id}`, payload);
    await mutate();
    await refreshProjects();
  }

  function initialFor(p: Project): Record<string, string> {
    return { name: p.name, status: p.status, ownerOrgId: p.ownerOrgId ?? "" };
  }

  const items = data?.items ?? [];

  return (
    <Shell>
      <PageHeader
        title="Projects"
        subtitle={`${items.length} project(s)`}
        action={
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} disabled={!hasOrgs} title={hasOrgs ? "" : "Create an organisation first"}>
            + New Project
          </button>
        }
      />

      {!hasOrgs && (
        <div className="empty">Create an <strong>Organization</strong> first — every project belongs to one.</div>
      )}

      {isLoading ? (
        <div className="center-msg">Loading…</div>
      ) : (
        <div className="table-card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Code</th><th>Organization</th><th>Status</th><th>Members</th><th></th></tr></thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty">No projects yet — create the first one.</div></td></tr>
                ) : items.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ color: "#64748b", fontSize: 12 }}>{p.code}</td>
                    <td>
                      {p.ownerOrg ? (
                        <span className="flex-gap"><span>🏢</span>{p.ownerOrg.name}</span>
                      ) : (
                        <span className="muted">— unassigned —</span>
                      )}
                    </td>
                    <td><StatusPill value={p.status} /></td>
                    <td>{p._count?.members ?? "—"}</td>
                    <td>
                      <div className="flex-gap">
                        <Link className="action-link" href={`/projects/${p.id}`}>Members</Link>
                        <button className="action-link" onClick={() => setEditing(p)}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <Modal title="Create Project" submitLabel="Create project" fields={createFields} onClose={() => setShowCreate(false)} onSubmit={create} />
      )}

      {editing && (
        <Modal
          title={`Edit ${editing.name}`}
          submitLabel="Save changes"
          fields={editFields}
          initialValues={initialFor(editing)}
          onClose={() => setEditing(null)}
          onSubmit={update}
        />
      )}
    </Shell>
  );
}
