"use client";

import { useState } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { PageHeader } from "@/components/Modal";
import { useApp } from "@/lib/store";
import { api, fetcher } from "@/lib/api";

interface PendingStep {
  id: string;
  stepNumber: number;
  dueDate: string | null;
  instance: { id: string; name: string; projectId: string; resourceType: string };
}

export default function WorkflowsPage() {
  const { projectId, me } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, mutate, isLoading } = useSWR<{ items: PendingStep[] }>(me ? `/me/pending-approvals` : null, fetcher);

  async function act(step: PendingStep, decision: "approve" | "reject") {
    setBusy(step.id);
    try {
      await api.post(`/projects/${step.instance.projectId}/workflows/${step.instance.id}/steps/${step.id}/${decision}`, {
        comment: decision === "approve" ? "Approved via web" : "Rejected via web",
      });
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  async function startDemo() {
    if (!projectId || !me) return;
    await api.post(`/projects/${projectId}/workflows`, {
      name: "Document Approval",
      resourceType: "document",
      steps: [
        { stepNumber: 1, assigneeId: me.id },
        { stepNumber: 2, assigneeId: me.id },
      ],
    });
    await mutate();
  }

  const items = data?.items ?? [];

  return (
    <Shell>
      <PageHeader
        title="Workflow Approvals"
        subtitle={`${items.length} item(s) pending your action`}
        action={<button className="btn btn-primary btn-sm" onClick={startDemo} disabled={!projectId}>+ Start approval workflow</button>}
      />

      {isLoading ? (
        <div className="center-msg">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty">No pending approvals. Start an approval workflow to see it here.</div>
      ) : (
        <div className="snag-grid">
          {items.map((s) => (
            <div className="kan-card" key={s.id} style={{ padding: 16 }}>
              <div className="kan-card-title">{s.instance.name}</div>
              <div className="kan-card-meta">Step {s.stepNumber} · {s.instance.resourceType}</div>
              <div className="flex-gap" style={{ marginTop: 12 }}>
                <button className="btn btn-primary btn-sm" disabled={busy === s.id} onClick={() => act(s, "approve")}>✓ Approve</button>
                <button className="btn btn-outline btn-sm" style={{ color: "#dc2626", borderColor: "#dc2626" }} disabled={busy === s.id} onClick={() => act(s, "reject")}>✗ Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
