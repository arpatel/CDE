"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { PageHeader, StatusPill } from "@/components/Modal";
import { api, fetcher } from "@/lib/api";

interface ProjectDetail { id: string; name: string; code: string; status: string; ownerOrg: { id: string; name: string } | null }
interface Member { id: string; userId: string; role: { id: string; name: string } | null; user: { id: string; displayName: string; email: string } }
interface UserLite { id: string; displayName: string; email: string }
interface Role { id: string; name: string }

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRoleId, setBulkRoleId] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: project } = useSWR<ProjectDetail>(id ? `/projects/${id}` : null, fetcher);
  const { data: members, mutate } = useSWR<{ items: Member[] }>(id ? `/projects/${id}/members` : null, fetcher);
  const { data: users } = useSWR<{ items: UserLite[] }>("/users", fetcher);
  const { data: roles } = useSWR<{ items: Role[] }>("/roles", fetcher);

  const memberItems = members?.items ?? [];
  const memberIds = new Set(memberItems.map((m) => m.userId));
  const availableUsers = (users?.items ?? []).filter((u) => !memberIds.has(u.id));
  const roleList = roles?.items ?? [];

  function toggle(uid: string) {
    setSelected((s) => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  }
  function toggleAll() {
    setSelected((s) => s.size === memberItems.length ? new Set() : new Set(memberItems.map((m) => m.userId)));
  }

  async function applyBulkRole() {
    if (!bulkRoleId || selected.size === 0) return;
    setBusy(true);
    try {
      await api.post(`/projects/${id}/members/bulk`, { userIds: [...selected], roleId: bulkRoleId });
      await mutate(); setSelected(new Set());
    } finally { setBusy(false); }
  }
  async function removeBulk() {
    if (selected.size === 0 || !confirm(`Remove ${selected.size} member(s)?`)) return;
    setBusy(true);
    try {
      await api.post(`/projects/${id}/members/bulk-remove`, { userIds: [...selected] });
      await mutate(); setSelected(new Set());
    } finally { setBusy(false); }
  }

  return (
    <Shell>
      <div className="breadcrumb" style={{ marginBottom: -8 }}>
        <Link href="/projects">Projects</Link> <span>/</span> {project?.name ?? "…"}
      </div>
      <PageHeader
        title={project?.name ?? "Project"}
        subtitle={project ? `${project.code} · ${project.ownerOrg?.name ?? "no org"} · ${project.status}` : ""}
        action={<button className="btn btn-primary btn-sm" onClick={() => setShowAssign(true)} disabled={availableUsers.length === 0} title={availableUsers.length ? "" : "All users already assigned"}>+ Assign Users</button>}
      />

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="table-card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>{selected.size} selected</strong>
          <span className="muted">Set role:</span>
          <select className="search-box" style={{ width: 200 }} value={bulkRoleId} onChange={(e) => setBulkRoleId(e.target.value)}>
            <option value="">Choose role…</option>
            {roleList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" disabled={busy || !bulkRoleId} onClick={applyBulkRole}>Apply role to {selected.size}</button>
          <button className="btn btn-outline btn-sm" style={{ color: "#dc2626", borderColor: "#dc2626" }} disabled={busy} onClick={removeBulk}>Remove {selected.size}</button>
          <button className="action-link" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="table-card">
        <div className="table-toolbar"><span className="table-title">{memberItems.length} member(s)</span><span className="muted">Tick rows to edit multiple at once</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={memberItems.length > 0 && selected.size === memberItems.length} onChange={toggleAll} /></th>
                <th>User</th><th>Email</th><th>Project Role</th>
              </tr>
            </thead>
            <tbody>
              {memberItems.length === 0 ? (
                <tr><td colSpan={4}><div className="empty">No users assigned yet — click “Assign Users”.</div></td></tr>
              ) : memberItems.map((m) => (
                <tr key={m.id}>
                  <td><input type="checkbox" checked={selected.has(m.userId)} onChange={() => toggle(m.userId)} /></td>
                  <td style={{ fontWeight: 600 }}>{m.user.displayName}</td>
                  <td style={{ color: "#64748b" }}>{m.user.email}</td>
                  <td>{m.role ? <span className="status-pill status-open">{m.role.name}</span> : <span className="muted">— none —</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAssign && (
        <AssignUsers
          projectId={id}
          users={availableUsers}
          roles={roleList}
          onClose={() => setShowAssign(false)}
          onDone={async () => { setShowAssign(false); await mutate(); }}
        />
      )}
    </Shell>
  );
}

// Multi-select assignment: pick several users + one role, assign in one call.
function AssignUsers({ projectId, users, roles, onClose, onDone }: {
  projectId: string; users: UserLite[]; roles: Role[]; onClose: () => void; onDone: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(uid: string) {
    setPicked((s) => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  }

  async function assign() {
    if (picked.size === 0 || !roleId) { setError("Pick at least one user and a role"); return; }
    setBusy(true); setError(null);
    try {
      await api.post(`/projects/${projectId}/members/bulk`, { userIds: [...picked], roleId });
      onDone();
    } catch { setError("Assignment failed"); } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h3>Assign Users to Project</h3>
        <div className="field">
          <label>Project role *</label>
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">Choose role…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Users ({picked.size} selected)</label>
          <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
            {users.length === 0 ? <div className="muted">No more users to assign.</div> : users.map((u) => (
              <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", fontSize: 13 }}>
                <input type="checkbox" checked={picked.has(u.id)} onChange={() => toggle(u.id)} />
                {u.displayName} <span className="muted">({u.email})</span>
              </label>
            ))}
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={assign}>{busy ? "Assigning…" : `Assign ${picked.size || ""}`}</button>
        </div>
      </div>
    </div>
  );
}
