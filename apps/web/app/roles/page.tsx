"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { PageHeader } from "@/components/Modal";
import { api, fetcher, ApiError } from "@/lib/api";
import { useApp } from "@/lib/store";

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  dataScope: string;
}
interface Catalogue { groups: { module: string; permissions: string[] }[]; wildcard: string }

// Data-visibility levels for a role.
const SCOPES = [
  { value: "OWN", label: "Assigned only", hint: "Sees only the projects / records they're assigned to" },
  { value: "OWN_ORG", label: "Own organization", hint: "Sees all data of their own organization (project-level role)" },
  { value: "ALL_ORG", label: "All organizations", hint: "Sees every organization — support / super-admin only, NOT a project role" },
];
const scopeLabel = (s: string) => SCOPES.find((x) => x.value === s)?.label ?? s;

// Action columns for the permission matrix, in display order.
const ACTION_COLS = ["read", "create", "update", "member:manage", "manage", "action"];
const ACTION_LABEL: Record<string, string> = {
  read: "Read", create: "Create", update: "Update", "member:manage": "Members", manage: "Manage", action: "Action",
};
const actionOf = (perm: string) => perm.split(":").slice(1).join(":");

export default function RolesPage() {
  const { me } = useApp();
  const isSuper = me?.permissions.includes("*") ?? false;
  const { data, mutate, isLoading } = useSWR<{ items: Role[] }>("/roles", fetcher);
  const { data: cat } = useSWR<Catalogue>("/roles/permissions", fetcher);
  const [editor, setEditor] = useState<{ role: Role | null } | null>(null);

  async function remove(role: Role) {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    await api.del(`/roles/${role.id}`);
    await mutate();
  }

  const items = data?.items ?? [];

  return (
    <Shell>
      <PageHeader
        title="Roles & Permissions"
        subtitle={`${items.length} role(s) · define access to your requirement`}
        action={<button className="btn btn-primary btn-sm" onClick={() => setEditor({ role: null })}>+ New Role</button>}
      />

      {isLoading ? (
        <div className="center-msg">Loading…</div>
      ) : (
        <div className="table-card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Role</th><th>Description</th><th>Access</th><th>Data scope</th><th>System</th><th></th></tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ color: "#64748b", fontSize: 12 }}>{r.description ?? "—"}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.permissions.includes("*")
                        ? <span className="status-pill status-approved">Full access</span>
                        : `${r.permissions.length} permission(s)`}
                    </td>
                    <td><span className="status-pill status-open">{scopeLabel(r.dataScope)}</span></td>
                    <td>{r.isSystem ? <span className="status-pill status-closed">System</span> : <span className="muted">Custom</span>}</td>
                    <td>
                      {!r.isSystem && (
                        <div className="flex-gap">
                          <button className="action-link" onClick={() => setEditor({ role: r })}>Edit</button>
                          <button className="action-link" style={{ color: "#dc2626" }} onClick={() => remove(r)}>Delete</button>
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

      {editor && cat && (
        <RoleEditor
          role={editor.role}
          catalogue={cat}
          isSuper={isSuper}
          onClose={() => setEditor(null)}
          onSaved={async () => { setEditor(null); await mutate(); }}
        />
      )}
    </Shell>
  );
}

function RoleEditor({ role, catalogue, isSuper, onClose, onSaved }: {
  role: Role | null;
  catalogue: Catalogue;
  isSuper: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [fullAccess, setFullAccess] = useState(role?.permissions.includes("*") ?? false);
  const [dataScope, setDataScope] = useState(role?.dataScope ?? "OWN_ORG");
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions.filter((p) => p !== "*") ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(p: string) {
    setSelected((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  }
  function toggleMany(perms: string[], on: boolean) {
    setSelected((s) => { const n = new Set(s); perms.forEach((p) => on ? n.add(p) : n.delete(p)); return n; });
  }

  // Build the matrix: which action columns are actually present, and a quick
  // lookup of (module, action) → permission string.
  const columns = (() => {
    const present = new Set<string>();
    for (const g of catalogue.groups) for (const p of g.permissions) present.add(actionOf(p));
    const ordered = ACTION_COLS.filter((a) => present.has(a));
    const extra = [...present].filter((a) => !ACTION_COLS.includes(a)).sort();
    return [...ordered, ...extra];
  })();
  const permOf = (g: { permissions: string[] }, action: string) => g.permissions.find((p) => actionOf(p) === action);
  const colPerms = (action: string) => catalogue.groups.map((g) => permOf(g, action)).filter((p): p is string => !!p);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    // Data-access level and full access (*) are super-admin-only; non-super
    // payloads omit them and the server pins the role to own-organisation scope.
    const permissions = isSuper && fullAccess ? ["*"] : [...selected];
    const payload: Record<string, unknown> = { name, description, permissions };
    if (isSuper) payload.dataScope = fullAccess ? "ALL_ORG" : dataScope;
    try {
      if (role) await api.patch(`/roles/${role.id}`, payload);
      else await api.post("/roles", payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <h3>{role ? `Edit role — ${role.name}` : "Create Role"}</h3>
        <form onSubmit={submit}>
          <div className="field"><label>Role name *</label><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Document Controller" /></div>
          <div className="field"><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role can do" /></div>

          {isSuper ? (
            <>
              <div className="field">
                <label>Data access level <span className="muted" style={{ fontWeight: 400 }}>(super-admin only)</span></label>
                <select value={fullAccess ? "ALL_ORG" : dataScope} disabled={fullAccess} onChange={(e) => setDataScope(e.target.value)}>
                  {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>)}
                </select>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, margin: "8px 0 12px" }}>
                <input type="checkbox" checked={fullAccess} onChange={(e) => setFullAccess(e.target.checked)} />
                Full access (super admin · <code>*</code>) — forces “All organizations”
              </label>
            </>
          ) : (
            <div className="field">
              <label>Data access level</label>
              <div className="muted" style={{ fontSize: 12 }}>
                🔒 Fixed to <strong>Own organization</strong>. Only a super admin can change a role's data-access level.
              </div>
            </div>
          )}

          {!fullAccess && (
            <div className="perm-matrix-wrap">
              <table className="perm-matrix">
                <thead>
                  <tr>
                    <th className="pm-mod">Module</th>
                    {columns.map((c) => {
                      const perms = colPerms(c);
                      const on = perms.length > 0 && perms.every((p) => selected.has(p));
                      return (
                        <th key={c}>
                          <div>{ACTION_LABEL[c] ?? c}</div>
                          <input type="checkbox" title={`Toggle ${ACTION_LABEL[c] ?? c} for all`} checked={on} onChange={(e) => toggleMany(perms, e.target.checked)} />
                        </th>
                      );
                    })}
                    <th className="pm-all">All</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogue.groups.map((g) => {
                    const rowOn = g.permissions.every((p) => selected.has(p));
                    return (
                      <tr key={g.module}>
                        <td className="pm-mod">{g.module}</td>
                        {columns.map((c) => {
                          const perm = permOf(g, c);
                          return (
                            <td key={c} className="pm-cell">
                              {perm
                                ? <input type="checkbox" checked={selected.has(perm)} onChange={() => toggle(perm)} />
                                : <span className="pm-na">–</span>}
                            </td>
                          );
                        })}
                        <td className="pm-cell"><input type="checkbox" checked={rowOn} onChange={(e) => toggleMany(g.permissions, e.target.checked)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {error && <div className="error-text">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save role"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
