"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { PageHeader } from "@/components/Modal";
import { api, fetcher } from "@/lib/api";

interface ProjectDetail { id: string; name: string; code: string; status: string; ownerOrg: { id: string; name: string } | null }
interface Member { id: string; userId: string; role: { id: string; name: string } | null; user: { id: string; displayName: string; email: string } }
interface UserLite { id: string; displayName: string; email: string }
interface Role { id: string; name: string }

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [addToRole, setAddToRole] = useState<Role | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const { data: project } = useSWR<ProjectDetail>(id ? `/projects/${id}` : null, fetcher);
  const { data: members, mutate } = useSWR<{ items: Member[] }>(id ? `/projects/${id}/members` : null, fetcher);
  const { data: users } = useSWR<{ items: UserLite[] }>("/users", fetcher);
  const { data: roles } = useSWR<{ items: Role[] }>("/roles", fetcher);

  const memberItems = members?.items ?? [];
  const roleList = roles?.items ?? [];
  const allUsers = users?.items ?? [];

  // Group members by role (+ an "unassigned" bucket).
  const byRole = new Map<string, Member[]>();
  const noRole: Member[] = [];
  for (const m of memberItems) {
    if (m.role) { const a = byRole.get(m.role.id) ?? []; a.push(m); byRole.set(m.role.id, a); }
    else noRole.push(m);
  }
  const roleNameByUser = new Map(memberItems.map((m) => [m.userId, m.role?.name ?? null]));

  async function removeMember(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this project?`)) return;
    setBusyUser(userId);
    try { await api.del(`/projects/${id}/members/${userId}`); await mutate(); }
    finally { setBusyUser(null); }
  }

  function MemberRow({ m }: { m: Member }) {
    return (
      <div className="member-chip">
        <span className="avatar-sm">{initials(m.user.displayName)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{m.user.displayName}</div>
          <div className="muted" style={{ fontSize: 11 }}>{m.user.email}</div>
        </div>
        <button className="action-link" style={{ color: "#dc2626" }} disabled={busyUser === m.userId} onClick={() => removeMember(m.userId, m.user.displayName)}>Remove</button>
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
            : list.map((m) => <MemberRow key={m.id} m={m} />)}
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
        subtitle={project ? `${project.code} · ${project.ownerOrg?.name ?? "no org"} · ${project.status} · ${memberItems.length} member(s)` : ""}
      />

      {roleList.length === 0 ? (
        <div className="empty">No roles defined yet — create roles under <strong>Admin → Roles</strong> first.</div>
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
          roleNameByUser={roleNameByUser}
          onClose={() => setAddToRole(null)}
          onDone={async () => { setAddToRole(null); await mutate(); }}
        />
      )}
    </Shell>
  );
}

// Add (or move) several users into one role at once.
function AddUsersToRole({ projectId, role, users, roleNameByUser, onClose, onDone }: {
  projectId: string; role: Role; users: UserLite[];
  roleNameByUser: Map<string, string | null>; onClose: () => void; onDone: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Users already in THIS role are not re-listed; others can be added or moved.
  const selectable = users.filter((u) => roleNameByUser.get(u.id) !== role.name);

  function toggle(uid: string) {
    setPicked((s) => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
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
          Selecting a user already in another role will move them to {role.name}.
        </p>
        <div className="field">
          <label>Users ({picked.size} selected)</label>
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
            {selectable.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No other users available.</div> : selectable.map((u) => {
              const cur = roleNameByUser.get(u.id);
              return (
                <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", fontSize: 13 }}>
                  <input type="checkbox" checked={picked.has(u.id)} onChange={() => toggle(u.id)} />
                  <span style={{ flex: 1 }}>{u.displayName} <span className="muted">({u.email})</span></span>
                  {cur && <span className="status-pill status-open" style={{ fontSize: 10 }}>in {cur}</span>}
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
