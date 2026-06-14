"use client";

import { Shell } from "@/components/Shell";
import { ResourceList, StatusPill } from "@/components/ResourceList";

export default function SnagsPage() {
  return (
    <Shell>
      <ResourceList
        title="Snagging / Punch List"
        plural="snags"
        createLabel="Snag"
        subtitle={(n) => `${n} items`}
        columns={[
          { key: "snagNumber", label: "No.", render: (r) => <strong style={{ color: "var(--accent)", fontSize: 12 }}>{r.snagNumber}</strong> },
          { key: "title", label: "Title", render: (r) => <span style={{ fontWeight: 600 }}>{r.title}</span> },
          { key: "location", label: "Location" },
          { key: "priority", label: "Priority", render: (r) => <span className={`priority-${r.priority}`}>{r.priority}</span> },
          { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
        ]}
        createFields={[
          { name: "title", label: "Title", required: true, placeholder: "Concrete spalling on column face" },
          { name: "location", label: "Location", placeholder: "Level 3, Col B3-7" },
          { name: "priority", label: "Priority", type: "select", options: [
            { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
            { value: "high", label: "High" }, { value: "critical", label: "Critical" },
          ] },
        ]}
      />
    </Shell>
  );
}
