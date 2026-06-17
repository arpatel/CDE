"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader } from "@/components/Modal";
import { api, fetcher } from "@/lib/api";

interface ProjectDetail { id: string; name: string; code: string; status: string; ownerOrg: { id: string; name: string } | null }
interface Member { id: string; userId: string; role: { id: string; name: string } | null; user: { id: string; displayName: string; email: string } }
interface UserLite { id: string; displayName: string; email: string }
interface Role { id: string; name: string; dataScope?: string }

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [addToRole, setAddToRole] = useState<Role | null>(null);
  const [showNewRole, setShowNewRole] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { data: project } = useSWR<ProjectDetail>(id ? `/projects/${id}` : null, fetcher);
  const { data: members, mutate } = useSWR<{ items: Member[] }>(id ? `/projects/${id}/members` : null, fetcher);
  const { data: users } = useSWR<{ items: UserLite[] }>("/users", fetcher);
  const { data: roles, mutate: mutateRoles } = useSWR<{ items: Role[] }>("/roles", fetcher);

  const memberItems = members?.items ?? [];
  // ALL_ORG roles are tenant-wide support / super-admin — not assignable per project.
  const roleList = (roles?.items ?? []).filter((r) => r.dataScope !== "ALL_ORG");
  const allUsers = users?.items ?? [];
  const distinctUsers = new Set(memberItems.map((m) => m.userId)).size;

  // Group membership rows by role (+ an "unassigned" bucket). A user can appear
  // under several roles (one membership row per role).
  const byRole = new Map<string, Member[]>();
  const noRole: Member[] = [];
  for (const m of memberItems) {
    if (m.role) { const a = byRole.get(m.role.id) ?? []; a.push(m); byRole.set(m.role.id, a); }
    else noRole.push(m);
  }
  // userId → list of role names they already hold (for the add picker).
  const rolesByUser = new Map<string, string[]>();
  for (const m of memberItems) {
    if (!m.role) continue;
    const a = rolesByUser.get(m.userId) ?? [];
    a.push(m.role.name);
    rolesByUser.set(m.userId, a);
  }

  async function removeFromRole(userId: string, roleId: string | null, name: string, roleName: string) {
    if (!confirm(`Remove ${name} from “${roleName}”?`)) return;
    const key = `${userId}:${roleId ?? "none"}`;
    setBusyKey(key);
    try {
      await api.del(`/projects/${id}/members/${userId}${roleId ? `?roleId=${roleId}` : ""}`);
      await mutate();
    } finally { setBusyKey(null); }
  }

  async function createRole(v: Record<string, string>) {
    await api.post("/roles", { name: v.name });
    await mutateRoles();
  }

  function MemberRow({ m, roleId, roleName }: { m: Member; roleId: string | null; roleName: string }) {
    const key = `${m.userId}:${roleId ?? "none"}`;
    return (
      <div className="member-chip">
        <span className="avatar-sm">{initials(m.user.displayName)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{m.user.displayName}</div>
          <div className="muted" style={{ fontSize: 11 }}>{m.user.email}</div>
        </div>
        <button className="action-link" style={{ color: "#dc2626" }} disabled={busyKey === key} onClick={() => removeFromRole(m.userId, roleId, m.user.displayName, roleName)}>Remove</button>
      </div>
    );
  }

  function RoleGroup({ role, list }: { role: Role | null; list: Member[] }) {
    return (
      <div className="role-group">
        <div className="role-group-head">
          <span className="role-badge">{role ? `🔑 ${role.name}` : "— No role —"}</span>
          <span className="muted" style={{ fontSize: 12 }}>{list.length} user(s)</span>
          {role && (
            <button className="btn btn-outline btn-sm" style={{ marginLeft: "auto" }} onClick={() => setAddToRole(role)}>+ Add user</button>
          )}
        </div>
        <div className="role-members">
          {list.length === 0
            ? <div className="muted" style={{ fontSize: 12, padding: "6px 2px" }}>No users in this role yet.</div>
            : list.map((m) => <MemberRow key={m.id} m={m} roleId={role?.id ?? null} roleName={role?.name ?? "No role"} />)}
        </div>
      </div>
    );
  }

  return (
    <Shell>
      <div className="breadcrumb" style={{ marginBottom: -8 }}>
        <Link href="/projects">Projects</Link> <span>/</span> {project?.name ?? "…"}
      </div>
      <PageHeader
        title={project?.name ?? "Project"}
        subtitle={project ? `${project.code} · ${project.ownerOrg?.name ?? "no org"} · ${project.status} · ${distinctUsers} member(s)` : ""}
        action={<button className="btn btn-outline btn-sm" onClick={() => setShowNewRole(true)}>+ New role</button>}
      />

      {roleList.length === 0 ? (
        <div className="empty">No roles defined yet — click <strong>+ New role</strong> to add one.</div>
      ) : (
        <div className="role-grid">
          {roleList.map((r) => <RoleGroup key={r.id} role={r} list={byRole.get(r.id) ?? []} />)}
          {noRole.length > 0 && <RoleGroup role={null} list={noRole} />}
        </div>
      )}

      {addToRole && (
        <AddUsersToRole
          projectId={id}
          role={addToRole}
          users={allUsers}
          rolesByUser={rolesByUser}
          onClose={() => setAddToRole(null)}
          onDone={async () => { setAddToRole(null); await mutate(); }}
        />
      )}

      {showNewRole && (
        <Modal
          title="New role"
          submitLabel="Create role"
          fields={[{ name: "name", label: "Role name", required: true, placeholder: "e.g. Quantity Surveyor" }]}
          onClose={() => setShowNewRole(false)}
          onSubmit={createRole}
        />
      )}
    </Shell>
  );
}

// Add several users to a role at once. Additive — a user keeps any other roles.
function AddUsersToRole({ projectId, role, users, rolesByUser, onClose, onDone }: {
  projectId: string; role: Role; users: UserLite[];
  rolesByUser: Map<string, string[]>; onClose: () => void; onDone: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hide users already in THIS role; everyone else can be added (keeping their
  // existing roles — a user may hold multiple roles).
  const selectable = users.filter((u) => !(rolesByUser.get(u.id) ?? []).includes(role.name));

  function toggle(uid: string) {
    setPicked((s) => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  }
  const allPicked = selectable.length > 0 && picked.size === selectable.length;
  function toggleAll() {
    setPicked(allPicked ? new Set() : new Set(selectable.map((u) => u.id)));
  }

  async function assign() {
    if (picked.size === 0) { setError("Pick at least one user"); return; }
    setBusy(true); setError(null);
    try {
      await api.post(`/projects/${projectId}/members/bulk`, { userIds: [...picked], roleId: role.id });
      onDone();
    } catch { setError("Assignment failed"); } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <h3>Add users to <span style={{ color: "var(--accent)" }}>{role.name}</span></h3>
        <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
          A user can hold several roles — adding here keeps their existing roles.
        </p>
        <div className="field">
          <label className="flex-gap" style={{ justifyContent: "space-between" }}>
            <span>Users ({picked.size} selected) — tick several to add at once</span>
            {selectable.length > 0 && (
              <button type="button" className="action-link" onClick={toggleAll}>{allPicked ? "Clear all" : "Select all"}</button>
            )}
          </label>
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
            {selectable.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>Everyone is already in this role.</div> : selectable.map((u) => {
              const cur = rolesByUser.get(u.id) ?? [];
              return (
                <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", fontSize: 13 }}>
                  <input type="checkbox" checked={picked.has(u.id)} onChange={() => toggle(u.id)} />
                  <span style={{ flex: 1 }}>{u.displayName} <span className="muted">({u.email})</span></span>
                  {cur.map((rn) => <span key={rn} className="status-pill status-open" style={{ fontSize: 10 }}>{rn}</span>)}
                </label>
              );
            })}
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={assign}>{busy ? "Adding…" : `Add ${picked.size || ""}`}</button>
        </div>
      </div>
    </div>
  );
}
