"use client";

import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { PageHeader } from "@/components/Modal";
import { useApp } from "@/lib/store";
import { fetcher } from "@/lib/api";

function Stat({ num, label, color, icon }: { num: number | string; label: string; color: string; icon: string }) {
  return (
    <div className="stat-card" style={{ ["--c" as any]: color }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-num">{num}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function useCount(plural: string) {
  const { projectId } = useApp();
  const { data } = useSWR<{ total: number }>(projectId ? `/projects/${projectId}/${plural}` : null, fetcher);
  return data?.total ?? 0;
}

export default function DashboardPage() {
  const { projectId, projects } = useApp();
  const project = projects.find((p) => p.id === projectId);
  const documents = useCount("documents");
  const rfis = useCount("rfis");
  const snags = useCount("snags");
  const ncrs = useCount("ncrs");
  const submittals = useCount("submittals");
  const incidents = useCount("hse-incidents");
  const { data: pending } = useSWR<{ total: number }>(projectId ? `/me/pending-approvals` : null, fetcher);

  return (
    <Shell>
      <PageHeader title="Project Dashboard" subtitle={project ? `${project.name} · ${project.code}` : "No project"} />
      <div className="stats-grid">
        <Stat num={documents} label="Documents" color="#2E75B6" icon="📄" />
        <Stat num={rfis} label="RFIs" color="#d97706" icon="❓" />
        <Stat num={snags} label="Snags" color="#dc2626" icon="📍" />
        <Stat num={submittals} label="Submittals" color="#7c3aed" icon="📋" />
        <Stat num={ncrs} label="NCRs" color="#0891b2" icon="✅" />
        <Stat num={incidents} label="HSE Incidents" color="#16a34a" icon="🦺" />
        <Stat num={pending?.total ?? 0} label="Pending Approvals" color="#b91c1c" icon="🔄" />
      </div>

      <div className="empty">
        Live data from the CDE API. Use the modules in the sidebar to create documents, RFIs, snags, workflows and more —
        counters above update automatically.
      </div>
    </Shell>
  );
}
