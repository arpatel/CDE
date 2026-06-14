"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { PageHeader } from "@/components/Modal";
import { api, fetcher, ApiError } from "@/lib/api";

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
  { value: "OWN", label: "Assigned only", hint: "Sees only projects/records they're assigned to" },
  { value: "OWN_ORG", label: "Own organization", hint: "Sees all data of their own organization" },
  { value: "ALL_ORG", label: "All organizations", hint: "Sees every organization's data (like super admin)" },
];
const scopeLabel = (s: string) => SCOPES.find((x) => x.value === s)?.label ?? s;

export default function RolesPage() {
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
          onClose={() => setEditor(null)}
          onSaved={async () => { setEditor(null); await mutate(); }}
        />
      )}
    </Shell>
  );
}

function RoleEditor({ role, catalogue, onClose, onSaved }: {
  role: Role | null;
  catalogue: Catalogue;
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
  function toggleModule(perms: string[], on: boolean) {
    setSelected((s) => { const n = new Set(s); perms.forEach((p) => on ? n.add(p) : n.delete(p)); return n; });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const permissions = fullAccess ? ["*"] : [...selected];
    const scope = fullAccess ? "ALL_ORG" : dataScope;
    try {
      if (role) await api.patch(`/roles/${role.id}`, { name, description, permissions, dataScope: scope });
      else await api.post("/roles", { name, description, permissions, dataScope: scope });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <h3>{role ? `Edit role — ${role.name}` : "Create Role"}</h3>
        <form onSubmit={submit}>
          <div className="field"><label>Role name *</label><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Document Controller" /></div>
          <div className="field"><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role can do" /></div>

          <div className="field">
            <label>Data access level</label>
            <select value={fullAccess ? "ALL_ORG" : dataScope} disabled={fullAccess} onChange={(e) => setDataScope(e.target.value)}>
              {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>)}
            </select>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, margin: "8px 0 12px" }}>
            <input type="checkbox" checked={fullAccess} onChange={(e) => setFullAccess(e.target.checked)} />
            Full access (super admin · <code>*</code>) — forces “All organizations”
          </label>

          {!fullAccess && (
            <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
              {catalogue.groups.map((g) => {
                const allOn = g.permissions.every((p) => selected.has(p));
                return (
                  <div key={g.module} style={{ marginBottom: 12 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--primary)", marginBottom: 4 }}>
                      <input type="checkbox" checked={allOn} onChange={(e) => toggleModule(g.permissions, e.target.checked)} />
                      {g.module}
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(96px, 1fr))", gap: "4px 10px", paddingLeft: 22 }}>
                      {g.permissions.map((p) => {
                        const action = p.split(":").slice(1).join(":");
                        return (
                          <label key={p} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, textTransform: "capitalize" }}>
                            <input type="checkbox" checked={selected.has(p)} onChange={() => toggle(p)} />
                            {action}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
