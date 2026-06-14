"use client";

import { useState } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StatusPill } from "@/components/Modal";
import { useApp } from "@/lib/store";
import { api, fetcher } from "@/lib/api";

interface Doc {
  id: string;
  docNumber: string;
  title: string;
  status: string;
  lockedBy: string | null;
  currentRevisionId: string | null;
}

export default function DocumentsPage() {
  const { projectId, me } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const key = projectId ? `/projects/${projectId}/documents` : null;
  const { data, mutate, isLoading } = useSWR<{ items: Doc[] }>(key, fetcher);

  async function create(values: Record<string, string>) {
    await api.post(`/projects/${projectId}/documents`, { title: values.title, type: values.type || undefined });
    await mutate();
  }

  // Demonstrates the presigned-upload → register-revision flow end to end.
  async function addRevision(doc: Doc) {
    setBusyId(doc.id);
    try {
      const filename = `${doc.title.replace(/\s+/g, "_")}.pdf`;
      const presign = await api.post<{ fileKey: string }>(`/projects/${projectId}/documents/upload-url`, {
        filename,
        mimeType: "application/pdf",
      });
      await api.post(`/projects/${projectId}/documents/${doc.id}/revisions`, {
        fileKey: presign.fileKey,
        mimeType: "application/pdf",
        fileSize: 1024,
      });
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleLock(doc: Doc) {
    setBusyId(doc.id);
    try {
      const action = doc.lockedBy ? "checkin" : "checkout";
      await api.post(`/projects/${projectId}/documents/${doc.id}/${action}`);
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  const items = data?.items ?? [];

  return (
    <Shell>
      <PageHeader
        title="Document Register"
        subtitle={`${items.length} documents`}
        action={
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} disabled={!projectId}>
            + Upload Document
          </button>
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
              <thead>
                <tr>
                  <th>Document</th><th>Number</th><th>Status</th><th>Lock</th><th>Revision</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty">No documents yet.</div></td></tr>
                ) : items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="flex-gap">
                        <div className="file-icon">PDF</div>
                        <div style={{ fontWeight: 600 }}>{d.title}</div>
                      </div>
                    </td>
                    <td style={{ color: "#64748b", fontSize: 12 }}>{d.docNumber}</td>
                    <td><StatusPill value={d.status} /></td>
                    <td>
                      {d.lockedBy ? (
                        <span className="status-pill status-wip">🔒 {d.lockedBy === me?.id ? "You" : "Locked"}</span>
                      ) : (
                        <span className="muted">Unlocked</span>
                      )}
                    </td>
                    <td>{d.currentRevisionId ? <span className="status-pill status-approved">Has revision</span> : <span className="muted">—</span>}</td>
                    <td>
                      <div className="flex-gap">
                        <button className="action-link" disabled={busyId === d.id} onClick={() => addRevision(d)}>+ Revision</button>
                        <button className="action-link" disabled={busyId === d.id} onClick={() => toggleLock(d)}>
                          {d.lockedBy ? "Check in" : "Check out"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <Modal
          title="Create Document"
          submitLabel="Create"
          fields={[
            { name: "title", label: "Title", required: true, placeholder: "Foundation Design Report" },
            { name: "type", label: "Type", placeholder: "general" },
          ]}
          onClose={() => setShowCreate(false)}
          onSubmit={create}
        />
      )}
    </Shell>
  );
}
