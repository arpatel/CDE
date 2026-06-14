"use client";

import { Shell } from "@/components/Shell";
import { ResourceList, StatusPill } from "@/components/ResourceList";

export default function DrawingsPage() {
  return (
    <Shell>
      <ResourceList
        title="Drawing Register"
        plural="drawings"
        createLabel="Drawing"
        subtitle={(n) => `${n} drawings`}
        columns={[
          { key: "drawingNumber", label: "No.", render: (r) => <strong style={{ color: "var(--accent)", fontSize: 12 }}>{r.drawingNumber}</strong> },
          { key: "title", label: "Title", render: (r) => <span style={{ fontWeight: 600 }}>{r.title}</span> },
          { key: "discipline", label: "Discipline" },
          { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
        ]}
        createFields={[
          { name: "title", label: "Title", required: true, placeholder: "Level B2 Framing Plan" },
          { name: "discipline", label: "Discipline", placeholder: "Structural" },
          { name: "scale", label: "Scale", placeholder: "1:100" },
        ]}
      />
    </Shell>
  );
}
