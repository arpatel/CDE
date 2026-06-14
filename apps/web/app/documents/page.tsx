"use client";

import { useState, type DragEvent } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StatusPill } from "@/components/Modal";
import { useApp } from "@/lib/store";
import { api, fetcher, ApiError } from "@/lib/api";

interface Doc { id: string; docNumber: string | null; title: string; status: string; currentRevisionId: string | null }
interface Folder { id: string; name: string }
interface Rev { id: string; revisionLabel: string; originalName: string | null; status: string; purposeOfIssue: string | null; fileSize: number }

const PURPOSES = ["For Information", "For Review", "For Comment", "For Approval", "For Construction", "For Tender", "As Built"];
const STATUSES = ["S0-WIP", "S1-Shared", "S2-Shared", "S3-Shared", "S4-Shared", "A-Authorized", "B-Partial Sign-off"];

export default function DocumentsPage() {
  const { projectId } = useApp();
  const [upload, setUpload] = useState<{ mode: "publish" | "revise"; doc?: Doc } | null>(null);
  const [showFolder, setShowFolder] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const key = projectId ? `/projects/${projectId}/documents` : null;
  const { data, mutate, isLoading } = useSWR<{ items: Doc[] }>(key, fetcher);
  const { data: folders, mutate: mutateFolders } = useSWR<{ items: Folder[] }>(projectId ? `/projects/${projectId}/folders` : null, fetcher);

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
    if (v.docNumberPrefix) payload.docNumberPrefix = v.docNumberPrefix;
    if (v.defaultStatus) payload.defaultStatus = v.defaultStatus;
    if (v.defaultPurpose) payload.defaultPurpose = v.defaultPurpose;
    await api.post(`/projects/${projectId}/folders`, payload);
    await mutateFolders();
  }

  const items = data?.items ?? [];

  return (
    <Shell>
      <PageHeader
        title="Document Register"
        subtitle={`${items.length} document(s)`}
        action={
          <div className="flex-gap">
            <button className="btn btn-outline btn-sm" onClick={() => setShowFolder(true)} disabled={!projectId}>🗂️ New Folder</button>
            <button className="btn btn-primary btn-sm" onClick={() => setUpload({ mode: "publish" })} disabled={!projectId}>⬆️ Upload</button>
          </div>
        }
      />

      {!projectId ? (
        <div className="empty">Select or create a project to continue.</div>
      ) : isLoading ? (
        <div className="center-msg">Loading…</div>
      ) : (
        <div className="table-card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Doc Ref</th><th>Title</th><th>Status</th><th>Revision</th><th></th></tr></thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={5}><div className="empty">No documents yet — click Upload.</div></td></tr>
                ) : items.map((d) => (
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
        </div>
      )}

      {upload && projectId && (
        <UploadDialog
          projectId={projectId}
          mode={upload.mode}
          doc={upload.doc}
          folders={folders?.items ?? []}
          onClose={() => setUpload(null)}
          onDone={async () => { setUpload(null); await mutate(); }}
        />
      )}

      {showFolder && (
        <Modal
          title="New Folder"
          submitLabel="Create folder"
          fields={[
            { name: "name", label: "Folder name", required: true, placeholder: "Drawings" },
            { name: "docNumberPrefix", label: "Doc Ref prefix (auto-numbering)", placeholder: "DWG" },
            { name: "defaultStatus", label: "Default status", type: "select", options: STATUSES.map((s) => ({ value: s, label: s })) },
            { name: "defaultPurpose", label: "Default purpose of issue", type: "select", options: PURPOSES.map((p) => ({ value: p, label: p })) },
          ]}
          onClose={() => setShowFolder(false)}
          onSubmit={createFolder}
        />
      )}
    </Shell>
  );
}

function UploadDialog({ projectId, mode, doc, folders, onClose, onDone }: {
  projectId: string; mode: "publish" | "revise"; doc?: Doc; folders: Folder[]; onClose: () => void; onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [secondary, setSecondary] = useState<File | null>(null);
  const [folderId, setFolderId] = useState("");
  const [title, setTitle] = useState("");
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
