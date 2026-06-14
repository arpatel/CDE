"use client";

import { Shell } from "@/components/Shell";
import { ResourceList, StatusPill } from "@/components/ResourceList";

export default function SubmittalsPage() {
  return (
    <Shell>
      <ResourceList
        title="Submittals"
        plural="submittals"
        createLabel="Submittal"
        subtitle={(n) => `${n} submittals`}
        columns={[
          { key: "submittalNumber", label: "No.", render: (r) => <strong style={{ color: "var(--accent)", fontSize: 12 }}>{r.submittalNumber}</strong> },
          { key: "title", label: "Title", render: (r) => <span style={{ fontWeight: 600 }}>{r.title}</span> },
          { key: "type", label: "Type" },
          { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
        ]}
        createFields={[
          { name: "title", label: "Title", required: true, placeholder: "Concrete Mix Design — Grade C40" },
          { name: "type", label: "Type", type: "select", options: [
            { value: "material", label: "Material" }, { value: "shop_drawing", label: "Shop Drawing" },
            { value: "sample", label: "Sample" }, { value: "om_manual", label: "O&M Manual" },
          ] },
          { name: "specSection", label: "Spec Section", placeholder: "03 30 00" },
        ]}
      />
    </Shell>
  );
}
