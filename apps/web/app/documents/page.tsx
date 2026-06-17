"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StatusPill } from "@/components/Modal";
import { useApp } from "@/lib/store";
import { api, fetcher, ApiError } from "@/lib/api";
import { exportCsv } from "@/lib/export";

interface Doc {
  id: string; docNumber: string | null; title: string; status: string;
  currentRevisionId: string | null; folderId?: string | null;
  revisionLabel?: string | null; uploadedAt?: string; uploadedBy?: string;
  attributes?: Record<string, unknown>;
}
interface ApplicableAttr {
  id: string; name: string; controlType: string; mandatory: boolean;
  options: string[]; defaultValue: string | null; setName: string | null;
}
interface Folder {
  id: string; name: string; parentId: string | null;
  docNumberPrefix?: string | null; defaultStatus?: string | null; defaultPurpose?: string | null;
  restricted?: boolean; canManage?: boolean; grantCount?: number;
  inherited?: boolean; inheritedFromId?: string | null;
}
interface Rev { id: string; revisionLabel: string; originalName: string | null; status: string; purposeOfIssue: string | null; fileSize: number }

const PURPOSES = ["For Information", "For Review", "For Comment", "For Approval", "For Construction", "For Tender", "As Built"];
const STATUSES = ["S0-WIP", "S1-Shared", "S2-Shared", "S3-Shared", "S4-Shared", "A-Authorized", "B-Partial Sign-off"];

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function DocumentsPage() {
  const { projectId } = useApp();
  const [upload, setUpload] = useState<{ mode: "publish" | "revise"; doc?: Doc } | null>(null);
  const [viewDoc, setViewDoc] = useState<Doc | null>(null);
  const [newFolderParent, setNewFolderParent] = useState<{ parentId: string | null } | null>(null);
  const [manageFolder, setManageFolder] = useState<Folder | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ folder: Folder; x: number; y: number } | null>(null);
  const [docMenu, setDocMenu] = useState<{ doc: Doc; x: number; y: number } | null>(null);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const key = projectId ? `/projects/${projectId}/document-register` : null;
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
          {f.restricted && (
            f.inherited
              ? <span title="Inherits access from a parent folder" style={{ marginLeft: 6, opacity: 0.55 }}>🔒</span>
              : <span title={`Custom access (${f.grantCount} grant(s)) — overrides parent`} style={{ marginLeft: 6 }}>🔒</span>
          )}
        </div>
      );
      return isOpen ? [row, ...renderTree(f.id, depth + 1)] : [row];
    });
  }

  // Close any open context menu on outside click / scroll.
  useEffect(() => {
    if (!menu && !docMenu) return;
    const close = () => { setMenu(null); setDocMenu(null); };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [menu, docMenu]);

  return (
    <Shell>
      <PageHeader
        title="Document Register"
        subtitle={`${items.length} document(s)`}
        action={
          <div className="flex-gap">
            <button className="btn btn-outline btn-sm" disabled={items.length === 0} onClick={() => exportCsv("document-register", [
              { label: "Doc Ref", key: "docNumber" },
              { label: "Title", key: "title" },
              { label: "Status", key: "status" },
              { label: "Revision", key: "revisionLabel" },
              { label: "Uploaded", value: (d) => fmtDate(d.uploadedAt) },
              { label: "Uploaded By", key: "uploadedBy" },
            ], items)}>⬇️ Export</button>
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
                  <thead><tr><th>Doc Ref</th><th>Title</th><th>Status</th><th>Rev</th><th>Uploaded</th><th>By</th><th></th></tr></thead>
                  <tbody>
                    {shown.length === 0 ? (
                      <tr><td colSpan={7}><div className="empty">No documents here — click Upload.</div></td></tr>
                    ) : shown.map((d) => (
                      <tr
                        key={d.id}
                        className={d.currentRevisionId ? "doc-row" : undefined}
                        onContextMenu={(e: MouseEvent) => { e.preventDefault(); setDocMenu({ doc: d, x: e.clientX, y: e.clientY }); }}
                      >
                        <td onClick={() => d.currentRevisionId && setViewDoc(d)} style={{ cursor: d.currentRevisionId ? "pointer" : "default" }}>
                          <div className="flex-gap"><div className="file-icon">DOC</div><span style={{ fontSize: 12, color: "#64748b" }}>{d.docNumber ?? "—"}</span></div>
                        </td>
                        <td
                          style={{ fontWeight: 600, cursor: d.currentRevisionId ? "pointer" : "default" }}
                          onClick={() => d.currentRevisionId && setViewDoc(d)}
                          title={d.currentRevisionId ? "Open online viewer" : "No file uploaded yet"}
                        >
                          <span className={d.currentRevisionId ? "doc-title-link" : undefined}>{d.title}</span>
                        </td>
                        <td><StatusPill value={d.status} /></td>
                        <td>{d.revisionLabel ?? (d.currentRevisionId ? "—" : <span className="muted">—</span>)}</td>
                        <td style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(d.uploadedAt)}</td>
                        <td style={{ fontSize: 12 }}>{d.uploadedBy ?? "—"}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="kebab-btn"
                            title="Actions"
                            onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setDocMenu({ doc: d, x: r.right - 180, y: r.bottom + 4 }); }}
                          >⋯</button>
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

      {/* ── Document right-click menu ──────────────────────────────── */}
      {docMenu && (
        <div className="ctx-menu" style={{ top: docMenu.y, left: Math.max(8, docMenu.x) }} onClick={(e) => e.stopPropagation()}>
          <button className="ctx-item" disabled={!docMenu.doc.currentRevisionId} onClick={() => { setViewDoc(docMenu.doc); setDocMenu(null); }}>👁️ View (online)</button>
          <button className="ctx-item" onClick={() => { setEditDoc(docMenu.doc); setDocMenu(null); }}>✏️ Edit attributes…</button>
          <button className="ctx-item" onClick={() => { setUpload({ mode: "revise", doc: docMenu.doc }); setDocMenu(null); }}>⬆️ New revision</button>
          <button className="ctx-item" disabled={!docMenu.doc.currentRevisionId || busyId === docMenu.doc.id} onClick={() => { const d = docMenu.doc; setDocMenu(null); downloadLatest(d); }}>⬇️ Download</button>
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

      {viewDoc && projectId && (
        <FileViewer projectId={projectId} doc={viewDoc} onClose={() => setViewDoc(null)} />
      )}

      {editDoc && projectId && (
        <EditAttributesDialog
          projectId={projectId}
          doc={editDoc}
          onClose={() => setEditDoc(null)}
          onSaved={async () => { setEditDoc(null); await mutate(); }}
        />
      )}
    </Shell>
  );
}

// ── Edit document attributes ─────────────────────────────────────────────────
function EditAttributesDialog({ projectId, doc, onClose, onSaved }: {
  projectId: string; doc: Doc; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [docRef, setDocRef] = useState(doc.docNumber ?? "");
  const [status, setStatus] = useState(doc.status);
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [attrs, setAttrs] = useState<ApplicableAttr[]>([]);
  const [attrValues, setAttrValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  // Pull current-revision attributes (purpose) + configurable attributes to pre-fill.
  useEffect(() => {
    (async () => {
      try {
        const revs = await api.get<{ items: Rev[] }>(`/projects/${projectId}/documents/${doc.id}/revisions`);
        const cur = revs.items[0];
        if (cur && !loaded.current) {
          setPurpose(cur.purposeOfIssue ?? "");
          loaded.current = true;
        }
      } catch { /* ignore */ }
      try {
        const q = doc.folderId ? `?folderId=${doc.folderId}` : "";
        const res = await api.get<{ items: ApplicableAttr[] }>(`/projects/${projectId}/applicable-attributes${q}`);
        setAttrs(res.items);
        setAttrValues(seedAttrValues(res.items, doc.attributes));
      } catch { setAttrs([]); }
    })();
  }, [projectId, doc.id, doc.folderId]);

  async function save() {
    if (attrs.some((a) => a.mandatory && isEmptyAttr(attrValues[a.id]))) {
      setError(`Please fill required attribute(s): ${attrs.filter((a) => a.mandatory && isEmptyAttr(attrValues[a.id])).map((a) => a.name).join(", ")}`);
      return;
    }
    setBusy(true); setError(null);
    const payload: Record<string, unknown> = { title, status, docNumber: docRef };
    if (purpose) payload.purposeOfIssue = purpose;
    if (notes) payload.revisionNotes = notes;
    if (attrs.length) payload.attributes = attrValues;
    try {
      await api.patch(`/projects/${projectId}/documents/${doc.id}/attributes`, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <h3>Edit attributes</h3>
        <div className="field"><label>Doc Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field"><label>Doc Ref (unique per folder)</label><input value={docRef} onChange={(e) => setDocRef(e.target.value)} placeholder="—" /></div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {(STATUSES.includes(status) ? STATUSES : [status, ...STATUSES]).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Purpose of Issue</label>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            <option value="">— unchanged —</option>
            {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field"><label>Revision Notes (optional)</label><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note to the current revision" /></div>
        <AttributeFields attrs={attrs} values={attrValues} onChange={(id, v) => setAttrValues((p) => ({ ...p, [id]: v }))} />
        {error && <div className="error-text">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Online file viewer ───────────────────────────────────────────────────────
type ViewKind = "pdf" | "image" | "video" | "audio" | "text" | "sheet" | "docx" | "unsupported";
type ViewState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; kind: ViewKind; url: string; type: string; name: string; text?: string; html?: string; blob?: Blob };

function classifyKind(type: string, name: string): ViewKind {
  const t = (type || "").toLowerCase();
  const n = (name || "").toLowerCase();
  const ext = n.includes(".") ? n.slice(n.lastIndexOf(".") + 1) : "";
  if (t === "application/pdf" || ext === "pdf") return "pdf";
  if (t.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "image";
  if (t.startsWith("video/") || ["mp4", "webm", "ogg", "mov"].includes(ext)) return "video";
  if (t.startsWith("audio/") || ["mp3", "wav", "oga", "m4a"].includes(ext)) return "audio";
  if (["xlsx", "xls", "xlsm", "ods"].includes(ext) || t.includes("spreadsheet") || t.includes("ms-excel")) return "sheet";
  if (ext === "docx" || t.includes("wordprocessingml")) return "docx";
  if (
    t.startsWith("text/") ||
    ["application/json", "application/xml", "application/javascript"].includes(t) ||
    ["txt", "md", "csv", "log", "json", "xml", "yml", "yaml", "html", "css", "js", "ts", "ini", "cfg"].includes(ext)
  )
    return "text";
  return "unsupported";
}

function FileViewer({ projectId, doc, onClose }: { projectId: string; doc: Doc; onClose: () => void }) {
  const [state, setState] = useState<ViewState>({ phase: "loading" });
  const urlRef = useRef<string | null>(null);
  const docxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const revs = await api.get<{ items: Rev[] }>(`/projects/${projectId}/documents/${doc.id}/revisions`);
        const latest = revs.items[0];
        if (!latest) { if (!cancelled) setState({ phase: "error", message: "No file/revision to preview." }); return; }
        const name = latest.originalName ?? doc.title;
        const { url, blob, type } = await api.openInline(`/projects/${projectId}/documents/${doc.id}/revisions/${latest.id}/download`);
        urlRef.current = url;
        const kind = classifyKind(type, name);
        let text: string | undefined;
        let html: string | undefined;
        if (kind === "text") {
          text = await blob.text();
        } else if (kind === "sheet") {
          // Render every worksheet to an HTML table (client-side, offline).
          const XLSX = await import("xlsx");
          const wb = XLSX.read(await blob.arrayBuffer(), { type: "array" });
          html = wb.SheetNames.map(
            (sn) => `<div class="sheet-tab">${sn}</div>${XLSX.utils.sheet_to_html(wb.Sheets[sn])}`,
          ).join("");
        }
        if (cancelled) { URL.revokeObjectURL(url); return; }
        setState({ phase: "ready", kind, url, type, name, text, html, blob });
      } catch (err) {
        if (!cancelled) setState({ phase: "error", message: err instanceof ApiError ? err.message : "Could not load file." });
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    };
  }, [projectId, doc.id, doc.title]);

  // DOCX renders asynchronously into a container element.
  useEffect(() => {
    if (state.phase !== "ready" || state.kind !== "docx" || !state.blob || !docxRef.current) return;
    let cancelled = false;
    const target = docxRef.current;
    (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        target.innerHTML = "";
        if (!cancelled) await renderAsync(state.blob!, target, undefined, { inWrapper: true, className: "docx" });
      } catch {
        if (!cancelled) target.innerHTML = '<div class="empty">Could not render this Word document — try Download.</div>';
      }
    })();
    return () => { cancelled = true; };
  }, [state]);

  async function download() {
    const revs = await api.get<{ items: Rev[] }>(`/projects/${projectId}/documents/${doc.id}/revisions`);
    const latest = revs.items[0];
    if (latest) await api.download(`/projects/${projectId}/documents/${doc.id}/revisions/${latest.id}/download`, latest.originalName ?? doc.title);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-head">
          <div style={{ minWidth: 0 }}>
            <div className="viewer-title">{doc.title}</div>
            <div className="muted" style={{ fontSize: 12 }}>{doc.docNumber ?? "—"}{state.phase === "ready" ? ` · ${state.name}` : ""}</div>
          </div>
          <div className="flex-gap">
            <button className="btn btn-outline btn-sm" onClick={download}>⬇️ Download</button>
            <button className="btn btn-outline btn-sm" onClick={onClose}>✕ Close</button>
          </div>
        </div>

        <div className="viewer-body">
          {state.phase === "loading" && <div className="center-msg">Loading preview…</div>}
          {state.phase === "error" && <div className="empty">{state.message}</div>}
          {state.phase === "ready" && (
            state.kind === "pdf" ? (
              <iframe title={state.name} src={state.url} className="viewer-frame" />
            ) : state.kind === "image" ? (
              <div className="viewer-center"><img src={state.url} alt={state.name} className="viewer-img" /></div>
            ) : state.kind === "video" ? (
              <div className="viewer-center"><video src={state.url} controls className="viewer-media" /></div>
            ) : state.kind === "audio" ? (
              <div className="viewer-center"><audio src={state.url} controls /></div>
            ) : state.kind === "text" ? (
              <pre className="viewer-text">{state.text}</pre>
            ) : state.kind === "sheet" ? (
              <div className="viewer-sheet" dangerouslySetInnerHTML={{ __html: state.html ?? "" }} />
            ) : state.kind === "docx" ? (
              <div className="viewer-docx"><div ref={docxRef} /></div>
            ) : (
              <div className="empty" style={{ textAlign: "center" }}>
                <div style={{ fontSize: 40 }}>📄</div>
                <p>No inline preview yet for this file type ({state.type || "unknown"}).</p>
                <p className="muted" style={{ fontSize: 12 }}>DWG / PPTX preview needs the conversion service (coming next) — for now, download to open.</p>
                <button className="btn btn-primary btn-sm" onClick={download}>⬇️ Download to open</button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Folder access assignment ─────────────────────────────────────────────────
type Level = "view" | "edit" | "manage";
interface Principal { id: string; displayName?: string; email?: string; name?: string }

interface PermsResponse {
  items: { principalType: string; principalId: string; accessLevel: Level }[];
  own: boolean;
  inherited: boolean;
  inheritedFrom: { id: string; name: string } | null;
  restricted: boolean;
}

function ManageAccessDialog({ projectId, folder, onClose, onSaved }: {
  projectId: string; folder: Folder; onClose: () => void; onSaved: () => void;
}) {
  const { data: princ } = useSWR<{ users: Principal[]; roles: Principal[] }>(`/projects/${projectId}/folder-principals`, fetcher);
  const { data: current } = useSWR<PermsResponse>(`/projects/${projectId}/folders/${folder.id}/permissions`, fetcher);
  // Top-level folders (directly under "All Documents") have no parent to inherit
  // from, so access must be set explicitly here.
  const isTopLevel = !folder.parentId;
  // "inherit" = follow parent (no own ACL); "custom" = independent own ACL.
  const [mode, setMode] = useState<"inherit" | "custom">(isTopLevel ? "custom" : "inherit");
  // key = `user:<id>` | `role:<id>` → access level (absence = no access)
  const [grants, setGrants] = useState<Record<string, Level>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stop re-seeding once the user starts editing, so a late SWR revalidation
  // can't wipe their in-progress changes. Until then, always seed from the
  // freshest server data (SWR can hand back a stale cached value first).
  const dirty = useRef(false);

  useEffect(() => {
    if (current && !dirty.current) {
      const next: Record<string, Level> = {};
      for (const g of current.items) next[`${g.principalType}:${g.principalId}`] = g.accessLevel;
      setGrants(next); // effective grants (own, or inherited copy) — seeds the editor when overriding
      // Default top-level folders to custom access; deeper folders inherit by default.
      setMode(current.own ? "custom" : isTopLevel ? "custom" : "inherit");
    }
  }, [current, isTopLevel]);

  function pickMode(m: "inherit" | "custom") {
    dirty.current = true;
    setMode(m);
  }
  function toggle(type: "user" | "role", id: string, checked: boolean) {
    dirty.current = true;
    setGrants((g) => {
      const n = { ...g };
      if (checked) n[`${type}:${id}`] = n[`${type}:${id}`] ?? "view";
      else delete n[`${type}:${id}`];
      return n;
    });
  }
  function setLevel(type: "user" | "role", id: string, level: Level) {
    dirty.current = true;
    setGrants((g) => ({ ...g, [`${type}:${id}`]: level }));
  }

  async function save() {
    setBusy(true); setError(null);
    // inherit mode → send empty (removes own ACL → reverts to parent / open)
    const payload = {
      grants: mode === "inherit" ? [] : Object.entries(grants).map(([k, accessLevel]) => {
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
  const parentName = current?.inheritedFrom?.name;
  const editable = mode === "custom";

  function row(type: "user" | "role", p: Principal) {
    const k = `${type}:${p.id}`;
    const on = grants[k] !== undefined;
    const label = type === "user" ? (p.displayName ?? p.email ?? "User") : (p.name ?? "Role");
    return (
      <div key={k} className="flex-gap" style={{ justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9", opacity: editable ? 1 : 0.6 }}>
        <label className="flex-gap" style={{ cursor: editable ? "pointer" : "default" }}>
          <input type="checkbox" checked={on} disabled={!editable} onChange={(e) => toggle(type, p.id, e.target.checked)} />
          <span>{type === "user" ? "👤" : "🏷️"} {label}</span>
          {type === "user" && p.email && <span className="muted" style={{ fontSize: 11 }}>{p.email}</span>}
        </label>
        {on && (
          <select value={grants[k]} disabled={!editable} onChange={(e) => setLevel(type, p.id, e.target.value as Level)} style={{ width: 130 }}>
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

        {/* Inherit vs. independent (override) selector */}
        <div className="field" style={{ marginTop: 4 }}>
          <label className="flex-gap" style={{ cursor: "pointer", marginBottom: 6 }}>
            <input type="radio" name="acl-mode" checked={mode === "inherit"} onChange={() => pickMode("inherit")} />
            <span>{parentName ? `Inherit access from “${parentName}”` : "No custom access (admins & creator only)"}</span>
          </label>
          <label className="flex-gap" style={{ cursor: "pointer" }}>
            <input type="radio" name="acl-mode" checked={mode === "custom"} onChange={() => pickMode("custom")} />
            <span>{isTopLevel ? "Set custom access (choose who can see it)" : "Set custom access (independent — overrides parent)"}</span>
          </label>
          {isTopLevel && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Top-level folder — no parent to inherit from, so set access explicitly.</div>}
        </div>

        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          {mode === "inherit"
            ? (parentName
                ? `This folder follows “${parentName}”. Subfolders below it inherit the same — until one is given its own access.`
                : "No access set — only admins and the creator can see this folder. Grant a role or member below to share it.")
            : (count === 0
                ? "Independent: no one selected yet — add at least one role or member, or it stays inaccessible to non-admins."
                : `Independent: only the ${count} selected (plus the creator & admins) can see this folder; its subfolders inherit this.`)}
        </p>

        <div style={{ maxHeight: 320, overflowY: "auto", marginTop: 4 }}>
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

// ── Dynamic configurable-attribute fields ────────────────────────────────────
function seedAttrValues(attrs: ApplicableAttr[], existing?: Record<string, unknown>): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const a of attrs) {
    if (existing && a.id in existing) { v[a.id] = existing[a.id]; continue; }
    if (a.controlType === "multiselect") v[a.id] = [];
    else if (a.controlType === "checkbox") v[a.id] = false;
    else v[a.id] = a.defaultValue ?? "";
  }
  return v;
}

function AttributeFields({ attrs, values, onChange }: {
  attrs: ApplicableAttr[]; values: Record<string, unknown>; onChange: (id: string, value: unknown) => void;
}) {
  if (attrs.length === 0) return null;
  return (
    <div className="attr-box">
      <div className="attr-box-head">📋 ATTRIBUTES</div>
      {attrs.map((a) => {
        const val = values[a.id];
        const label = <label>{a.name}{a.mandatory && <span style={{ color: "#dc2626" }}> *</span>}{a.setName && <span className="muted" style={{ fontSize: 11 }}> · {a.setName}</span>}</label>;
        if (a.controlType === "dropdown") {
          return (
            <div className="field" key={a.id}>{label}
              <select value={String(val ?? "")} onChange={(e) => onChange(a.id, e.target.value)}>
                <option value="">— select —</option>
                {a.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          );
        }
        if (a.controlType === "radio") {
          return (
            <div className="field" key={a.id}>{label}
              <div className="flex-gap" style={{ flexWrap: "wrap", gap: 12 }}>
                {a.options.map((o) => (
                  <label key={o} className="flex-gap" style={{ cursor: "pointer" }}>
                    <input type="radio" name={a.id} checked={val === o} onChange={() => onChange(a.id, o)} /> {o}
                  </label>
                ))}
              </div>
            </div>
          );
        }
        if (a.controlType === "multiselect") {
          const arr = Array.isArray(val) ? (val as string[]) : [];
          return (
            <div className="field" key={a.id}>{label}
              <div className="flex-gap" style={{ flexWrap: "wrap", gap: 12 }}>
                {a.options.map((o) => (
                  <label key={o} className="flex-gap" style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={arr.includes(o)} onChange={(e) => onChange(a.id, e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} /> {o}
                  </label>
                ))}
              </div>
            </div>
          );
        }
        if (a.controlType === "checkbox") {
          return (
            <div className="field" key={a.id}>
              <label className="flex-gap" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={val === true} onChange={(e) => onChange(a.id, e.target.checked)} /> {a.name}{a.mandatory && <span style={{ color: "#dc2626" }}> *</span>}
              </label>
            </div>
          );
        }
        if (a.controlType === "textarea") {
          return <div className="field" key={a.id}>{label}<textarea rows={2} value={String(val ?? "")} onChange={(e) => onChange(a.id, e.target.value)} /></div>;
        }
        const inputType = a.controlType === "number" ? "number" : a.controlType === "date" ? "date" : "text";
        return <div className="field" key={a.id}>{label}<input type={inputType} value={String(val ?? "")} onChange={(e) => onChange(a.id, e.target.value)} /></div>;
      })}
    </div>
  );
}

// ── Upload / revise ──────────────────────────────────────────────────────────
function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}
function isEmptyAttr(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
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
  const [attrs, setAttrs] = useState<ApplicableAttr[]>([]);
  const [attrValues, setAttrValues] = useState<Record<string, unknown>>({});

  // Load configurable attributes applicable to the selected folder (publish only).
  useEffect(() => {
    if (mode !== "publish") return;
    let cancelled = false;
    (async () => {
      try {
        const q = folderId ? `?folderId=${folderId}` : "";
        const res = await api.get<{ items: ApplicableAttr[] }>(`/projects/${projectId}/applicable-attributes${q}`);
        if (cancelled) return;
        setAttrs(res.items);
        setAttrValues((prev) => seedAttrValues(res.items, prev));
      } catch { if (!cancelled) setAttrs([]); }
    })();
    return () => { cancelled = true; };
  }, [projectId, folderId, mode]);

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
    if (mode === "publish") {
      const missing = attrs.filter((a) => a.mandatory && isEmptyAttr(attrValues[a.id])).map((a) => a.name);
      if (missing.length) { setError(`Please fill required attribute(s): ${missing.join(", ")}`); return; }
    }
    setBusy(true); setError(null);
    const form = new FormData();
    form.append("file", file);
    if (secondary) form.append("secondaryFile", secondary);
    if (mode === "publish") {
      if (folderId) form.append("folderId", folderId);
      if (title) form.append("title", title);
      if (docRef.trim()) form.append("docNumber", docRef.trim());
      if (attrs.length) form.append("attributes", JSON.stringify(attrValues));
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
            <AttributeFields attrs={attrs} values={attrValues} onChange={(id, v) => setAttrValues((p) => ({ ...p, [id]: v }))} />
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
