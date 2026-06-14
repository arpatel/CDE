"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StatusPill } from "@/components/Modal";
import { useApp } from "@/lib/store";
import { api, fetcher, ApiError } from "@/lib/api";

interface Doc { id: string; docNumber: string | null; title: string; status: string; currentRevisionId: string | null; folderId?: string | null }
interface Folder {
  id: string; name: string; parentId: string | null;
  docNumberPrefix?: string | null; defaultStatus?: string | null; defaultPurpose?: string | null;
  restricted?: boolean; canManage?: boolean; grantCount?: number;
}
interface Rev { id: string; revisionLabel: string; originalName: string | null; status: string; purposeOfIssue: string | null; fileSize: number }

const PURPOSES = ["For Information", "For Review", "For Comment", "For Approval", "For Construction", "For Tender", "As Built"];
const STATUSES = ["S0-WIP", "S1-Shared", "S2-Shared", "S3-Shared", "S4-Shared", "A-Authorized", "B-Partial Sign-off"];

export default function DocumentsPage() {
  const { projectId } = useApp();
  const [upload, setUpload] = useState<{ mode: "publish" | "revise"; doc?: Doc } | null>(null);
  const [newFolderParent, setNewFolderParent] = useState<{ parentId: string | null } | null>(null);
  const [manageFolder, setManageFolder] = useState<Folder | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ folder: Folder; x: number; y: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const key = projectId ? `/projects/${projectId}/documents` : null;
  const { data, mutate, isLoading } = useSWR<{ items: Doc[] }>(key, fetcher);
  const { data: folders, mutate: mutateFolders } = useSWR<{ items: Folder[] }>(
    projectId ? `/projects/${projectId}/folders` : null,
    fetcher,
  );

  const folderList = folders?.items ?? [];
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    for (const f of folderList) {
      const arr = map.get(f.parentId ?? null) ?? [];
      arr.push(f);
      map.set(f.parentId ?? null, arr);
    }
    return map;
  }, [folderList]);

  async function downloadLatest(doc: Doc) {
    setBusyId(doc.id);
    try {
      const revs = await api.get<{ items: Rev[] }>(`/projects/${projectId}/documents/${doc.id}/revisions`);
      const latest = revs.items[0];
      if (!latest) return;
      await api.download(`/projects/${projectId}/documents/${doc.id}/revisions/${latest.id}/download`, latest.originalName ?? doc.title);
    } finally { setBusyId(null); }
  }

  async function createFolder(v: Record<string, string>) {
    const payload: Record<string, string> = { name: v.name };
    if (newFolderParent?.parentId) payload.parentId = newFolderParent.parentId;
    if (v.docNumberPrefix) payload.docNumberPrefix = v.docNumberPrefix;
    if (v.defaultStatus) payload.defaultStatus = v.defaultStatus;
    if (v.defaultPurpose) payload.defaultPurpose = v.defaultPurpose;
    const created = await api.post<Folder>(`/projects/${projectId}/folders`, payload);
    if (newFolderParent?.parentId) setExpanded((s) => new Set(s).add(newFolderParent.parentId!));
    await mutateFolders();
    if (created?.id) setSelectedFolder(created.id);
  }

  const items = data?.items ?? [];
  // Filter documents to the selected folder when items expose folderId.
  const shown = selectedFolder && items.some((d) => d.folderId !== undefined)
    ? items.filter((d) => (d.folderId ?? null) === selectedFolder)
    : items;

  function toggle(id: string) {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function renderTree(parentId: string | null, depth: number): JSX.Element[] {
    const kids = childrenOf.get(parentId) ?? [];
    return kids.flatMap((f) => {
      const grandkids = childrenOf.get(f.id) ?? [];
      const isOpen = expanded.has(f.id);
      const row = (
        <div
          key={f.id}
          className={`tree-row${selectedFolder === f.id ? " tree-row-active" : ""}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => setSelectedFolder(f.id)}
          onContextMenu={(e: MouseEvent) => { e.preventDefault(); setMenu({ folder: f, x: e.clientX, y: e.clientY }); }}
        >
          <span
            className="tree-caret"
            onClick={(e) => { e.stopPropagation(); if (grandkids.length) toggle(f.id); }}
          >
            {grandkids.length ? (isOpen ? "▾" : "▸") : "•"}
          </span>
          <span className="tree-icon">📁</span>
          <span className="tree-name">{f.name}</span>
          {f.restricted && <span title={`Restricted (${f.grantCount} grant(s))`} style={{ marginLeft: 6 }}>🔒</span>}
        </div>
      );
      return isOpen ? [row, ...renderTree(f.id, depth + 1)] : [row];
    });
  }

  // Close the context menu on any outside click / escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [menu]);

  return (
    <Shell>
      <PageHeader
        title="Document Register"
        subtitle={`${items.length} document(s)`}
        action={
          <div className="flex-gap">
            <button className="btn btn-outline btn-sm" onClick={() => setNewFolderParent({ parentId: null })} disabled={!projectId}>🗂️ New Folder</button>
            <button className="btn btn-primary btn-sm" onClick={() => setUpload({ mode: "publish" })} disabled={!projectId}>⬆️ Upload</button>
          </div>
        }
      />

      {!projectId ? (
        <div className="empty">Select or create a project to continue.</div>
      ) : (
        <div className="doc-layout">
          {/* ── Folder tree ─────────────────────────────────────────── */}
          <aside className="folder-rail">
            <div className="folder-rail-head">
              <span>Folders</span>
              <button className="action-link" onClick={() => setNewFolderParent({ parentId: null })}>+ New</button>
            </div>
            <div
              className={`tree-row${selectedFolder === null ? " tree-row-active" : ""}`}
              style={{ paddingLeft: 8 }}
              onClick={() => setSelectedFolder(null)}
            >
              <span className="tree-caret">•</span>
              <span className="tree-icon">🏠</span>
              <span className="tree-name">All documents</span>
            </div>
            {renderTree(null, 0)}
            {folderList.length === 0 && <div className="muted" style={{ padding: "8px 10px", fontSize: 12 }}>No folders yet. Right-click a folder for actions.</div>}
            <div className="muted" style={{ padding: "8px 10px", fontSize: 11 }}>Tip: right-click a folder to add a subfolder or manage access.</div>
          </aside>

          {/* ── Document list ───────────────────────────────────────── */}
          <div className="table-card" style={{ flex: 1, minWidth: 0 }}>
            {isLoading ? (
              <div className="center-msg">Loading…</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Doc Ref</th><th>Title</th><th>Status</th><th>Revision</th><th></th></tr></thead>
                  <tbody>
                    {shown.length === 0 ? (
                      <tr><td colSpan={5}><div className="empty">No documents here — click Upload.</div></td></tr>
                    ) : shown.map((d) => (
                      <tr key={d.id}>
                        <td><div className="flex-gap"><div className="file-icon">DOC</div><span style={{ fontSize: 12, color: "#64748b" }}>{d.docNumber ?? "—"}</span></div></td>
                        <td style={{ fontWeight: 600 }}>{d.title}</td>
                        <td><StatusPill value={d.status} /></td>
                        <td>{d.currentRevisionId ? <span className="status-pill status-approved">Published</span> : <span className="muted">—</span>}</td>
                        <td>
                          <div className="flex-gap">
                            <button className="action-link" disabled={busyId === d.id} onClick={() => downloadLatest(d)}>Download</button>
                            <button className="action-link" onClick={() => setUpload({ mode: "revise", doc: d })}>New Revision</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Right-click context menu ──────────────────────────────── */}
      {menu && (
        <div className="ctx-menu" style={{ top: menu.y, left: menu.x }} onClick={(e) => e.stopPropagation()}>
          <button className="ctx-item" onClick={() => { setNewFolderParent({ parentId: menu.folder.id }); setMenu(null); }}>🗂️ New subfolder</button>
          <button className="ctx-item" onClick={() => { setSelectedFolder(menu.folder.id); setUpload({ mode: "publish" }); setMenu(null); }}>⬆️ Upload here</button>
          <button
            className="ctx-item"
            disabled={menu.folder.canManage === false}
            title={menu.folder.canManage === false ? "You can't manage access for this folder" : ""}
            onClick={() => { setManageFolder(menu.folder); setMenu(null); }}
          >
            👥 Manage access…
          </button>
        </div>
      )}

      {upload && projectId && (
        <UploadDialog
          projectId={projectId}
          mode={upload.mode}
          doc={upload.doc}
          folders={folderList}
          defaultFolderId={selectedFolder}
          onClose={() => setUpload(null)}
          onDone={async () => { setUpload(null); await mutate(); }}
        />
      )}

      {newFolderParent && (
        <Modal
          title={newFolderParent.parentId
            ? `New subfolder in "${folderList.find((f) => f.id === newFolderParent.parentId)?.name ?? "folder"}"`
            : "New Folder"}
          submitLabel="Create folder"
          fields={[
            { name: "name", label: "Folder name", required: true, placeholder: "Drawings" },
            { name: "docNumberPrefix", label: "Doc Ref prefix (auto-numbering)", placeholder: "DWG" },
            { name: "defaultStatus", label: "Default status", type: "select", options: STATUSES.map((s) => ({ value: s, label: s })) },
            { name: "defaultPurpose", label: "Default purpose of issue", type: "select", options: PURPOSES.map((p) => ({ value: p, label: p })) },
          ]}
          onClose={() => setNewFolderParent(null)}
          onSubmit={createFolder}
        />
      )}

      {manageFolder && projectId && (
        <ManageAccessDialog
          projectId={projectId}
          folder={manageFolder}
          onClose={() => setManageFolder(null)}
          onSaved={async () => { setManageFolder(null); await mutateFolders(); }}
        />
      )}
    </Shell>
  );
}

// ── Folder access assignment ─────────────────────────────────────────────────
type Level = "view" | "edit" | "manage";
interface Principal { id: string; displayName?: string; email?: string; name?: string }

function ManageAccessDialog({ projectId, folder, onClose, onSaved }: {
  projectId: string; folder: Folder; onClose: () => void; onSaved: () => void;
}) {
  const { data: princ } = useSWR<{ users: Principal[]; roles: Principal[] }>(`/projects/${projectId}/folder-principals`, fetcher);
  const { data: current } = useSWR<{ items: { principalType: string; principalId: string; accessLevel: Level }[] }>(
    `/projects/${projectId}/folders/${folder.id}/permissions`,
    fetcher,
  );
  // key = `user:<id>` | `role:<id>` → access level (absence = no access)
  const [grants, setGrants] = useState<Record<string, Level>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (current && !loaded.current) {
      const next: Record<string, Level> = {};
      for (const g of current.items) next[`${g.principalType}:${g.principalId}`] = g.accessLevel;
      setGrants(next);
      loaded.current = true;
    }
  }, [current]);

  function toggle(type: "user" | "role", id: string, checked: boolean) {
    setGrants((g) => {
      const n = { ...g };
      if (checked) n[`${type}:${id}`] = n[`${type}:${id}`] ?? "view";
      else delete n[`${type}:${id}`];
      return n;
    });
  }
  function setLevel(type: "user" | "role", id: string, level: Level) {
    setGrants((g) => ({ ...g, [`${type}:${id}`]: level }));
  }

  async function save() {
    setBusy(true); setError(null);
    const payload = {
      grants: Object.entries(grants).map(([k, accessLevel]) => {
        const [principalType, principalId] = k.split(":");
        return { principalType, principalId, accessLevel };
      }),
    };
    try {
      await api.put(`/projects/${projectId}/folders/${folder.id}/permissions`, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  const count = Object.keys(grants).length;

  function row(type: "user" | "role", p: Principal) {
    const k = `${type}:${p.id}`;
    const on = grants[k] !== undefined;
    const label = type === "user" ? (p.displayName ?? p.email ?? "User") : (p.name ?? "Role");
    return (
      <div key={k} className="flex-gap" style={{ justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
        <label className="flex-gap" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={on} onChange={(e) => toggle(type, p.id, e.target.checked)} />
          <span>{type === "user" ? "👤" : "🏷️"} {label}</span>
          {type === "user" && p.email && <span className="muted" style={{ fontSize: 11 }}>{p.email}</span>}
        </label>
        {on && (
          <select value={grants[k]} onChange={(e) => setLevel(type, p.id, e.target.value as Level)} style={{ width: 130 }}>
            <option value="view">Can view</option>
            <option value="edit">Can upload</option>
            <option value="manage">Can manage</option>
          </select>
        )}
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h3>Manage access — {folder.name}</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
          {count === 0
            ? "Open folder: visible to everyone with document access on this project."
            : `Restricted: only the ${count} selected user(s)/role(s) (plus the creator and admins) can see this folder.`}
        </p>

        <div style={{ maxHeight: 360, overflowY: "auto", marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600, margin: "8px 0 2px" }}>ROLES</div>
          {(princ?.roles ?? []).length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No roles.</div> : (princ?.roles ?? []).map((r) => row("role", r))}

          <div className="muted" style={{ fontSize: 12, fontWeight: 600, margin: "14px 0 2px" }}>PROJECT MEMBERS</div>
          {(princ?.users ?? []).length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No project members yet — add members on the project page.</div> : (princ?.users ?? []).map((u) => row("user", u))}
        </div>

        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save access"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Upload / revise ──────────────────────────────────────────────────────────
function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function UploadDialog({ projectId, mode, doc, folders, defaultFolderId, onClose, onDone }: {
  projectId: string; mode: "publish" | "revise"; doc?: Doc; folders: Folder[]; defaultFolderId: string | null; onClose: () => void; onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [secondary, setSecondary] = useState<File | null>(null);
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [title, setTitle] = useState("");
  const [docRef, setDocRef] = useState("");
  const [revisionLabel, setRevisionLabel] = useState(mode === "publish" ? "P01" : "");
  const [purpose, setPurpose] = useState("For Information");
  const [status, setStatus] = useState("S0-WIP");
  const [notes, setNotes] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const BLOCKED = [".exe", ".php", ".htaccess", ".bat", ".cmd", ".sh", ".com", ".msi"];
  function blocked(name: string) { const n = name.toLowerCase(); return BLOCKED.some((e) => n.endsWith(e)); }

  function onDrop(e: DragEvent) {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  async function submit() {
    if (!file) { setError("Select a file to upload"); return; }
    if (blocked(file.name)) { setError(`File type not allowed: ${file.name}`); return; }
    setBusy(true); setError(null);
    const form = new FormData();
    form.append("file", file);
    if (secondary) form.append("secondaryFile", secondary);
    if (mode === "publish") {
      if (folderId) form.append("folderId", folderId);
      if (title) form.append("title", title);
      if (docRef.trim()) form.append("docNumber", docRef.trim());
    }
    if (revisionLabel) form.append("revisionLabel", revisionLabel);
    form.append("purposeOfIssue", purpose);
    form.append("status", status);
    if (notes) form.append("revisionNotes", notes);
    try {
      const path = mode === "publish"
        ? `/projects/${projectId}/documents/publish`
        : `/projects/${projectId}/documents/${doc!.id}/revise`;
      await api.upload(path, form);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h3>{mode === "publish" ? "Upload Document" : `New Revision — ${doc?.title}`}</h3>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          style={{ border: `2px dashed ${drag ? "var(--accent)" : "#cbd5e1"}`, borderRadius: 10, padding: 20, textAlign: "center", background: drag ? "#eff6ff" : "#f8fafc", marginBottom: 14 }}
        >
          {file ? (
            <div style={{ fontSize: 13 }}><strong>{file.name}</strong> <span className="muted">({Math.round(file.size / 1024)} KB)</span></div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>Drag a file here, or</div>
          )}
          <label className="btn btn-outline btn-sm" style={{ marginTop: 8, cursor: "pointer" }}>
            {file ? "Choose different file" : "Select File"}
            <input type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Not allowed: .exe, .php, .htaccess, .bat, .cmd, .sh</div>
        </div>

        {mode === "publish" && (
          <>
            <div className="field">
              <label>Folder (drives Doc Ref / default status & purpose)</label>
              <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">— none (auto from project code) —</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Doc Ref (blank = auto-numbered, unique per folder)</label>
              <div className="flex-gap" style={{ alignItems: "stretch" }}>
                <input style={{ flex: 1 }} value={docRef} onChange={(e) => setDocRef(e.target.value)} placeholder="auto" />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  title={file ? "Use file name as Doc Ref" : "Select a file first"}
                  disabled={!file}
                  onClick={() => file && setDocRef(baseName(file.name))}
                >🏷️ Use file name</button>
              </div>
            </div>
            <div className="field"><label>Doc Title (blank = from filename)</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="auto" /></div>
          </>
        )}

        <div className="field"><label>Revision</label><input value={revisionLabel} onChange={(e) => setRevisionLabel(e.target.value)} placeholder={mode === "publish" ? "P01" : "auto (next)"} /></div>
        <div className="field">
          <label>Purpose of Issue</label>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>{PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </div>
        <div className="field"><label>Revision Notes</label><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="field">
          <label>Secondary File (optional)</label>
          <input type="file" onChange={(e) => setSecondary(e.target.files?.[0] ?? null)} />
        </div>

        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? "Uploading…" : "Upload"}</button>
        </div>
      </div>
    </div>
  );
}
