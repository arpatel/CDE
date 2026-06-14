"use client";

import { Shell } from "@/components/Shell";
import { ResourceList, StatusPill } from "@/components/ResourceList";

export default function NcrsPage() {
  return (
    <Shell>
      <ResourceList
        title="Non-Conformance Reports"
        plural="ncrs"
        createLabel="NCR"
        subtitle={(n) => `${n} NCRs`}
        columns={[
          { key: "ncrNumber", label: "No.", render: (r) => <strong style={{ color: "var(--accent)", fontSize: 12 }}>{r.ncrNumber}</strong> },
          { key: "title", label: "Title", render: (r) => <span style={{ fontWeight: 600 }}>{r.title}</span> },
          { key: "severity", label: "Severity" },
          { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
        ]}
        createFields={[
          { name: "title", label: "Title", required: true, placeholder: "Concrete cover deficiency" },
          { name: "location", label: "Location", placeholder: "Level 2, Grid C4" },
          { name: "severity", label: "Severity", type: "select", options: [
            { value: "minor", label: "Minor" }, { value: "major", label: "Major" }, { value: "critical", label: "Critical" },
          ] },
        ]}
      />
    </Shell>
  );
}
