"use client";

import { useState } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StatusPill } from "@/components/Modal";
import { useApp } from "@/lib/store";
import { api, fetcher } from "@/lib/api";

interface Rfi {
  id: string;
  rfiNumber: string;
  subject: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export default function RfisPage() {
  const { projectId } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [respondTo, setRespondTo] = useState<Rfi | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const key = projectId ? `/projects/${projectId}/rfis` : null;
  const { data, mutate, isLoading } = useSWR<{ items: Rfi[] }>(key, fetcher);

  async function create(v: Record<string, string>) {
    await api.post(`/projects/${projectId}/rfis`, {
      subject: v.subject,
      priority: v.priority || "medium",
      description: v.description || undefined,
    });
    await mutate();
  }

  async function respond(v: Record<string, string>) {
    await api.post(`/projects/${projectId}/rfis/${respondTo!.id}/respond`, { body: v.body });
    await mutate();
  }

  async function close(rfi: Rfi) {
    setBusyId(rfi.id);
    try {
      await api.post(`/projects/${projectId}/rfis/${rfi.id}/close`);
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  const items = data?.items ?? [];

  return (
    <Shell>
      <PageHeader
        title="RFI Register"
        subtitle={`${items.length} RFIs`}
        action={
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} disabled={!projectId}>
            + New RFI
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
                <tr><th>RFI No.</th><th>Subject</th><th>Priority</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={5}><div className="empty">No RFIs yet.</div></td></tr>
                ) : items.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, color: "var(--accent)", fontSize: 12 }}>{r.rfiNumber}</td>
                    <td style={{ fontWeight: 600 }}>{r.subject}</td>
                    <td><span className={`priority-${r.priority}`}>{r.priority}</span></td>
                    <td><StatusPill value={r.status} /></td>
                    <td>
                      <div className="flex-gap">
                        <button className="action-link" onClick={() => setRespondTo(r)}>Respond</button>
                        {r.status !== "closed" && r.status !== "void" && (
                          <button className="action-link" disabled={busyId === r.id} onClick={() => close(r)}>Close</button>
                        )}
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
          title="Create RFI"
          fields={[
            { name: "subject", label: "Subject", required: true, placeholder: "Foundation depth discrepancy at Grid C4" },
            { name: "priority", label: "Priority", type: "select", options: [
              { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
              { value: "high", label: "High" }, { value: "critical", label: "Critical" },
            ] },
            { name: "description", label: "Description", type: "textarea" },
          ]}
          onClose={() => setShowCreate(false)}
          onSubmit={create}
        />
      )}

      {respondTo && (
        <Modal
          title={`Respond to ${respondTo.rfiNumber}`}
          submitLabel="Send response"
          fields={[{ name: "body", label: "Response", type: "textarea", required: true }]}
          onClose={() => setRespondTo(null)}
          onSubmit={respond}
        />
      )}
    </Shell>
  );
}
