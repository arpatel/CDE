"use client";

import { useState } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StatusPill, type Field } from "@/components/Modal";
import { api, fetcher } from "@/lib/api";
import { useApp } from "@/lib/store";

interface Membership { organization: { id: string; name: string }; role: { id: string; name: string } | null }
interface User { id: string; email: string; displayName: string; status: string; memberships: Membership[] }
interface Org { id: string; name: string }
interface Role { id: string; name: string }

const STATUSES = ["ACTIVE", "INVITED", "SUSPENDED", "DISABLED"];

export default function UsersPage() {
  const { me } = useApp();
  const canManage = !!me && (me.permissions.includes("*") || me.permissions.includes("user:manage"));
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data, mutate, isLoading } = useSWR<{ items: User[] }>("/users", fetcher);
  const { data: orgs } = useSWR<{ items: Org[] }>("/organizations", fetcher);
  const { data: roles } = useSWR<{ items: Role[] }>("/roles", fetcher);

  const orgOptions = (orgs?.items ?? []).map((o) => ({ value: o.id, label: o.name }));
  const roleOptions = (roles?.items ?? []).map((r) => ({ value: r.id, label: r.name }));
  const canCreate = orgOptions.length > 0 && roleOptions.length > 0;

  const createFields: Field[] = [
    { name: "displayName", label: "Full name", required: true, placeholder: "Jane Engineer" },
    { name: "email", label: "Email", required: true, placeholder: "jane@company.com" },
    { name: "password", label: "Temporary password", required: true, placeholder: "min 8 characters" },
    { name: "organizationId", label: "Organization", type: "select", required: true, options: orgOptions },
    { name: "roleId", label: "Role", type: "select", required: true, options: roleOptions },
  ];

  const editFields: Field[] = [
    { name: "displayName", label: "Full name", required: true },
    { name: "status", label: "Status", type: "select", options: STATUSES.map((s) => ({ value: s, label: s })) },
    { name: "organizationId", label: "Organization", type: "select", options: orgOptions },
    { name: "roleId", label: "Role", type: "select", options: roleOptions },
    { name: "password", label: "Reset password (leave blank to keep)", placeholder: "min 8 characters" },
  ];

  async function create(v: Record<string, string>) {
    await api.post("/users", {
      displayName: v.displayName,
      email: v.email,
      password: v.password,
      organizationId: v.organizationId,
      roleId: v.roleId,
    });
    await mutate();
  }

  async function update(v: Record<string, string>) {
    // 1. Profile / status / password (only fields the PATCH accepts).
    const patch: Record<string, string> = {};
    if (v.displayName) patch.displayName = v.displayName;
    if (v.status) patch.status = v.status;
    if (v.password) patch.password = v.password;
    await api.patch(`/users/${editing!.id}`, patch);

    // 2. Reassign org + role only if it actually changed.
    const current = editing!.memberships[0];
    const orgChanged = v.organizationId && v.organizationId !== current?.organization.id;
    const roleChanged = v.roleId && v.roleId !== current?.role?.id;
    if (v.organizationId && v.roleId && (orgChanged || roleChanged)) {
      await api.post(`/users/${editing!.id}/memberships`, { organizationId: v.organizationId, roleId: v.roleId });
    }
    await mutate();
  }

  function initialFor(u: User): Record<string, string> {
    const m = u.memberships[0];
    return {
      displayName: u.displayName,
      status: u.status,
      organizationId: m?.organization.id ?? "",
      roleId: m?.role?.id ?? "",
      password: "",
    };
  }

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
          canManage ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} disabled={!canCreate} title={canCreate ? "" : "Create an organisation first"}>
              + New User
            </button>
          ) : (
            <span className="muted">You don’t have user-management rights</span>
          )
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
        <Modal title="Create User" submitLabel="Create user" fields={createFields} onClose={() => setShowCreate(false)} onSubmit={create} />
      )}

      {editing && canManage && (
        <Modal
          title={`Edit ${editing.displayName}`}
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
