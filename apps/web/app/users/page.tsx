"use client";

import { useState } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { PageHeader, StatusPill } from "@/components/Modal";
import { api, fetcher, ApiError } from "@/lib/api";
import { exportCsv } from "@/lib/export";
import { useApp } from "@/lib/store";

interface Membership { organization: { id: string; name: string }; role: { id: string; name: string } | null }
interface User { id: string; email: string; displayName: string; status: string; memberships: Membership[] }
interface Org { id: string; name: string }
interface Role { id: string; name: string; level?: string; dataScope?: string }

const STATUSES = ["ACTIVE", "INVITED", "SUSPENDED", "DISABLED"];

// Resolve the access-tier roles by name (seeded org-level tiers).
function tierRoles(roles: Role[]) {
  const byName = (n: string) => roles.find((r) => r.name === n);
  return {
    superAdmin: byName("Tenant Admin"),
    orgAdmin: byName("Organization Admin"),
    orgMember: byName("Organization Member"),
  };
}

export default function UsersPage() {
  const { me } = useApp();
  const isSuper = !!me?.permissions.includes("*");
  const canManage = !!me && (isSuper || me.permissions.includes("user:manage"));
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data, mutate, isLoading } = useSWR<{ items: User[] }>("/users", fetcher);
  const { data: orgs } = useSWR<{ items: Org[] }>("/organizations", fetcher);
  const { data: roles } = useSWR<{ items: Role[] }>("/roles", fetcher);

  const orgList = orgs?.items ?? [];
  const tiers = tierRoles(roles?.items ?? []);
  const canCreate = orgList.length > 0 && !!tiers.orgMember;

  async function deactivate(u: User) {
    setBusyId(u.id);
    try {
      await api.del(`/users/${u.id}`);
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  const items = data?.items ?? [];

  return (
    <Shell>
      <PageHeader
        title="Users"
        subtitle={`${items.length} user(s) · admin provisioning`}
        action={
          <div className="flex-gap">
            <button className="btn btn-outline btn-sm" disabled={items.length === 0} onClick={() => exportCsv("users", [
              { label: "Name", key: "displayName" },
              { label: "Email", key: "email" },
              { label: "Organization", value: (u) => u.memberships.map((m: Membership) => m.organization.name).join("; ") },
              { label: "Role(s)", value: (u) => u.memberships.map((m: Membership) => m.role?.name ?? "—").join("; ") },
              { label: "Status", key: "status" },
            ], items)}>⬇️ Export</button>
            {canManage ? (
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} disabled={!canCreate} title={canCreate ? "" : "Create an organisation first"}>
                + New User
              </button>
            ) : (
              <span className="muted">You don’t have user-management rights</span>
            )}
          </div>
        }
      />

      {canManage && !canCreate && (
        <div className="empty">Create at least one <strong>Organization</strong> before adding users (a user is assigned to an org + role).</div>
      )}

      {isLoading ? (
        <div className="center-msg">Loading…</div>
      ) : (
        <div className="table-card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Organization · Role</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={5}><div className="empty">No users yet.</div></td></tr>
                ) : items.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.displayName}</td>
                    <td style={{ color: "#64748b" }}>{u.email}</td>
                    <td>
                      {u.memberships.length === 0 ? <span className="muted">—</span> :
                        u.memberships.map((m, i) => (
                          <div key={i} style={{ fontSize: 12 }}>{m.organization.name} · <strong>{m.role?.name ?? "—"}</strong></div>
                        ))}
                    </td>
                    <td><StatusPill value={u.status} /></td>
                    <td>
                      {canManage && (
                        <div className="flex-gap">
                          <button className="action-link" onClick={() => setEditing(u)}>Edit</button>
                          {u.status !== "DISABLED" && u.id !== me?.id && (
                            <button className="action-link" style={{ color: "#dc2626" }} disabled={busyId === u.id} onClick={() => deactivate(u)}>Deactivate</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && canManage && (
        <UserDialog mode="create" orgs={orgList} tiers={tiers}
          onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); await mutate(); }} />
      )}

      {editing && canManage && (
        <UserDialog mode="edit" user={editing} orgs={orgList} tiers={tiers}
          onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await mutate(); }} />
      )}
    </Shell>
  );
}

// Create / edit a user. Org level = organisation + access tier (checkboxes);
// functional roles are assigned per project, not here.
type Tiers = ReturnType<typeof tierRoles>;
function UserDialog({ mode, user, orgs, tiers, onClose, onSaved }: {
  mode: "create" | "edit"; user?: User; orgs: Org[]; tiers: Tiers;
  onClose: () => void; onSaved: () => void;
}) {
  const current = user?.memberships[0];
  const currentRole = current?.role?.name;
  // Super admin is NOT assignable from this screen (security). Existing super
  // admins are shown read-only and preserved on save.
  const wasSuper = currentRole === "Tenant Admin";
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [organizationId, setOrganizationId] = useState(current?.organization.id ?? orgs[0]?.id ?? "");
  const [status, setStatus] = useState(user?.status ?? "ACTIVE");
  const [orgAdmin, setOrgAdmin] = useState(currentRole === "Organization Admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function tierRoleId(): string | undefined {
    if (wasSuper) return tiers.superAdmin?.id; // preserve — not changeable here
    if (orgAdmin) return tiers.orgAdmin?.id;
    return tiers.orgMember?.id;
  }

  async function submit() {
    const roleId = tierRoleId();
    if (!displayName.trim() || !email.trim() || !organizationId || !roleId) { setError("Name, email, organisation and access level are required"); return; }
    if (mode === "create" && password.length < 8) { setError("Temporary password must be at least 8 characters"); return; }
    setBusy(true); setError(null);
    try {
      if (mode === "create") {
        await api.post("/users", { displayName, email, password, organizationId, roleId });
      } else {
        const patch: Record<string, string> = { displayName, status };
        if (password) patch.password = password;
        await api.patch(`/users/${user!.id}`, patch);
        const orgChanged = organizationId !== current?.organization.id;
        const roleChanged = roleId !== current?.role?.id;
        if (orgChanged || roleChanged) await api.post(`/users/${user!.id}/memberships`, { organizationId, roleId });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <h3>{mode === "create" ? "Create User" : `Edit ${user!.displayName}`}</h3>
        <div className="field"><label>Full name</label><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Engineer" /></div>
        <div className="field"><label>Email</label><input value={email} disabled={mode === "edit"} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" /></div>
        <div className="field"><label>{mode === "create" ? "Temporary password" : "Reset password (blank = keep)"}</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 characters" /></div>
        <div className="field">
          <label>Organization</label>
          <select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
            <option value="">— select —</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Access level <span className="muted" style={{ fontWeight: 400 }}>(functional roles are assigned per project)</span></label>
          {wasSuper ? (
            <div className="muted" style={{ fontSize: 12 }}>
              👑 <strong>Super Admin</strong> — all organisations. Managed at system level; not changeable here.
            </div>
          ) : (
            <>
              <label className="flex-gap" style={{ cursor: "pointer", padding: "4px 0" }}>
                <input type="checkbox" checked={orgAdmin} onChange={(e) => setOrgAdmin(e.target.checked)} />
                <span>🛡️ Org Admin <span className="muted" style={{ fontSize: 11 }}>— manage their own organisation’s users & projects</span></span>
              </label>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                {orgAdmin ? "Own-organisation admin." : "Own-organisation member (gets capabilities from project roles)."}
              </div>
            </>
          )}
        </div>

        {mode === "edit" && (
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : mode === "create" ? "Create user" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}
