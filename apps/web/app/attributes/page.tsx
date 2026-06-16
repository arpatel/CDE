"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { PageHeader, StatusPill } from "@/components/Modal";
import { useApp } from "@/lib/store";
import { api, fetcher, ApiError } from "@/lib/api";

const CONTROL_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text area" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date picker" },
  { value: "dropdown", label: "Dropdown" },
  { value: "multiselect", label: "Multi-selection" },
  { value: "radio", label: "Radio buttons" },
  { value: "checkbox", label: "Checkbox" },
];
const LIST_TYPES = ["dropdown", "multiselect", "radio"];

interface Attr {
  id: string; name: string; controlType: string; mandatory: boolean; status: string;
  options: string[]; defaultValue: string | null; setId: string | null;
  set?: { id: string; name: string } | null;
}
interface AttrSet {
  id: string; name: string; isDefault: boolean; status: string; hierarchy: string;
  locations: string[]; attributes?: { id: string }[];
}
interface Folder { id: string; name: string }

export default function AttributesPage() {
  const { projectId } = useApp();
  const [tab, setTab] = useState<"library" | "sets">("library");
  const [editAttr, setEditAttr] = useState<Attr | "new" | null>(null);
  const [editSet, setEditSet] = useState<AttrSet | "new" | null>(null);

  const attrsKey = projectId ? `/projects/${projectId}/attributes` : null;
  const setsKey = projectId ? `/projects/${projectId}/attribute-sets` : null;
  const { data: attrs, mutate: mutateAttrs } = useSWR<{ items: Attr[] }>(attrsKey, fetcher);
  const { data: sets, mutate: mutateSets } = useSWR<{ items: AttrSet[] }>(setsKey, fetcher);
  const { data: folders } = useSWR<{ items: Folder[] }>(projectId ? `/projects/${projectId}/folders` : null, fetcher);

  const setList = sets?.items ?? [];
  const attrList = attrs?.items ?? [];
  const folderList = folders?.items ?? [];
  const folderName = useMemo(() => new Map(folderList.map((f) => [f.id, f.name])), [folderList]);

  return (
    <Shell>
      <PageHeader
        title="Configurable Attributes"
        subtitle="User-defined fields and attribute sets for this project template"
        action={
          tab === "library" ? (
            <button className="btn btn-primary btn-sm" onClick={() => setEditAttr("new")} disabled={!projectId}>+ Create Attribute</button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setEditSet("new")} disabled={!projectId}>+ Create Set</button>
          )
        }
      />

      {!projectId ? (
        <div className="empty">Select or create a project to continue.</div>
      ) : (
        <>
          <div className="tabs">
            <button className={`tab${tab === "library" ? " tab-active" : ""}`} onClick={() => setTab("library")}>Attributes Library</button>
            <button className={`tab${tab === "sets" ? " tab-active" : ""}`} onClick={() => setTab("sets")}>Attribute Sets</button>
          </div>

          {tab === "library" ? (
            <div className="table-card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Attribute Name</th><th>Control Type</th><th>Mandatory</th><th>Status</th><th>Attribute Set</th></tr></thead>
                  <tbody>
                    {attrList.length === 0 ? (
                      <tr><td colSpan={5}><div className="empty">No attributes yet — click Create Attribute.</div></td></tr>
                    ) : attrList.map((a) => (
                      <tr key={a.id} className="doc-row" onClick={() => setEditAttr(a)} style={{ cursor: "pointer" }}>
                        <td style={{ fontWeight: 600 }}><span className="doc-title-link">{a.name}</span></td>
                        <td>{CONTROL_TYPES.find((c) => c.value === a.controlType)?.label ?? a.controlType}</td>
                        <td>{a.mandatory ? "Yes" : "No"}</td>
                        <td><StatusPill value={a.status} /></td>
                        <td>{a.set?.name ?? <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="table-card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Set Name</th><th>Default</th><th>Status</th><th>Hierarchy</th><th>Locations</th><th>Attributes</th></tr></thead>
                  <tbody>
                    {setList.length === 0 ? (
                      <tr><td colSpan={6}><div className="empty">No attribute sets yet — click Create Set.</div></td></tr>
                    ) : setList.map((s) => (
                      <tr key={s.id} className="doc-row" onClick={() => setEditSet(s)} style={{ cursor: "pointer" }}>
                        <td style={{ fontWeight: 600 }}><span className="doc-title-link">{s.name}</span></td>
                        <td>{s.isDefault ? "✓ Default" : <span className="muted">—</span>}</td>
                        <td><StatusPill value={s.status} /></td>
                        <td style={{ textTransform: "capitalize" }}>{s.hierarchy}</td>
                        <td style={{ fontSize: 12, color: "#64748b" }}>
                          {s.hierarchy === "project"
                            ? "Whole project"
                            : (s.locations.length ? s.locations.map((id) => folderName.get(id) ?? "?").join(", ") : "— none —")}
                        </td>
                        <td>{s.attributes?.length ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {editAttr && projectId && (
        <AttributeDialog
          projectId={projectId}
          attr={editAttr === "new" ? null : editAttr}
          sets={setList}
          onClose={() => setEditAttr(null)}
          onSaved={async () => { setEditAttr(null); await mutateAttrs(); await mutateSets(); }}
        />
      )}
      {editSet && projectId && (
        <SetDialog
          projectId={projectId}
          set={editSet === "new" ? null : editSet}
          folders={folderList}
          onClose={() => setEditSet(null)}
          onSaved={async () => { setEditSet(null); await mutateSets(); }}
        />
      )}
    </Shell>
  );
}

// ── Create / edit a configurable attribute ───────────────────────────────────
function AttributeDialog({ projectId, attr, sets, onClose, onSaved }: {
  projectId: string; attr: Attr | null; sets: AttrSet[]; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(attr?.name ?? "");
  const [controlType, setControlType] = useState(attr?.controlType ?? "text");
  const [setId, setSetId] = useState(attr?.setId ?? "");
  const [mandatory, setMandatory] = useState(attr?.mandatory ?? false);
  const [status, setStatus] = useState(attr?.status ?? "active");
  const [optionsText, setOptionsText] = useState((attr?.options ?? []).join("\n"));
  const [defaultValue, setDefaultValue] = useState(attr?.defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isList = LIST_TYPES.includes(controlType);

  async function save() {
    if (!name.trim()) { setError("Attribute name is required"); return; }
    const options = optionsText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (isList && options.length === 0) { setError("Add at least one option for a list control"); return; }
    setBusy(true); setError(null);
    const payload: Record<string, unknown> = {
      name: name.trim(), controlType, mandatory, status,
      options: isList ? options : [],
      setId: setId || undefined,
      defaultValue: defaultValue.trim() || undefined,
    };
    try {
      if (attr) await api.patch(`/projects/${projectId}/attributes/${attr.id}`, payload);
      else await api.post(`/projects/${projectId}/attributes`, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <h3>{attr ? "Edit attribute" : "Create attribute"}</h3>
        <div className="field"><label>Attribute Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Discipline" /></div>
        <div className="field">
          <label>Control Type</label>
          <select value={controlType} onChange={(e) => setControlType(e.target.value)}>
            {CONTROL_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        {isList && (
          <div className="field">
            <label>Options (one per line)</label>
            <textarea rows={4} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={"Architectural\nStructural\nMEP"} />
          </div>
        )}
        <div className="field">
          <label>Attribute Set</label>
          <select value={setId} onChange={(e) => setSetId(e.target.value)}>
            <option value="">— unassigned —</option>
            {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Default Value (optional)</label><input value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} /></div>
        <div className="flex-gap" style={{ gap: 18, margin: "4px 0 10px" }}>
          <label className="flex-gap" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> Mandatory
          </label>
          <label className="flex-gap" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={status === "active"} onChange={(e) => setStatus(e.target.checked ? "active" : "inactive")} /> Active
          </label>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Create / edit an attribute set ───────────────────────────────────────────
function SetDialog({ projectId, set, folders, onClose, onSaved }: {
  projectId: string; set: AttrSet | null; folders: Folder[]; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(set?.name ?? "");
  const [status, setStatus] = useState(set?.status ?? "active");
  const [isDefault, setIsDefault] = useState(set?.isDefault ?? false);
  const [hierarchy, setHierarchy] = useState(set?.hierarchy ?? "project");
  const [locations, setLocations] = useState<string[]>(set?.locations ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleFolder(id: string, on: boolean) {
    setLocations((l) => (on ? [...new Set([...l, id])] : l.filter((x) => x !== id)));
  }

  async function save() {
    if (!name.trim()) { setError("Set name is required"); return; }
    setBusy(true); setError(null);
    const payload: Record<string, unknown> = {
      name: name.trim(), status, isDefault, hierarchy,
      locations: hierarchy === "folder" ? locations : [],
    };
    try {
      if (set) await api.patch(`/projects/${projectId}/attribute-sets/${set.id}`, payload);
      else await api.post(`/projects/${projectId}/attribute-sets`, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <h3>{set ? "Edit attribute set" : "Create attribute set"}</h3>
        <div className="field"><label>Set Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Drawing Metadata" /></div>
        <div className="field">
          <label>Hierarchy (where the set applies)</label>
          <select value={hierarchy} onChange={(e) => setHierarchy(e.target.value)}>
            <option value="project">Project level (all folders)</option>
            <option value="folder">Folder level (selected folders)</option>
          </select>
        </div>
        {hierarchy === "folder" && (
          <div className="field">
            <label>Locations (folders)</label>
            <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
              {folders.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No folders in this project yet.</div> : folders.map((f) => (
                <label key={f.id} className="flex-gap" style={{ cursor: "pointer", padding: "3px 0" }}>
                  <input type="checkbox" checked={locations.includes(f.id)} onChange={(e) => toggleFolder(f.id, e.target.checked)} /> 📁 {f.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex-gap" style={{ gap: 18, margin: "4px 0 10px" }}>
          <label className="flex-gap" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Default set
          </label>
          <label className="flex-gap" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={status === "active"} onChange={(e) => setStatus(e.target.checked ? "active" : "inactive")} /> Active
          </label>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
