"use client";

import { Shell } from "@/components/Shell";
import { ResourceList, StatusPill } from "@/components/ResourceList";

export default function HsePage() {
  return (
    <Shell>
      <ResourceList
        title="HSE Incidents"
        plural="hse-incidents"
        createLabel="Incident"
        subtitle={(n) => `${n} incidents`}
        columns={[
          { key: "incidentNumber", label: "No.", render: (r) => <strong style={{ color: "var(--accent)", fontSize: 12 }}>{r.incidentNumber}</strong> },
          { key: "type", label: "Type" },
          { key: "severity", label: "Severity" },
          { key: "description", label: "Description" },
          { key: "status", label: "Status", render: (r) => <StatusPill value={r.status} /> },
        ]}
        createFields={[
          { name: "type", label: "Type", type: "select", options: [
            { value: "near_miss", label: "Near Miss" }, { value: "first_aid", label: "First Aid" },
            { value: "medical_treatment", label: "Medical Treatment" }, { value: "lost_time", label: "Lost Time" },
          ] },
          { name: "severity", label: "Severity", type: "select", options: [
            { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" },
          ] },
          { name: "description", label: "Description", type: "textarea", required: true },
        ]}
      />
    </Shell>
  );
}
