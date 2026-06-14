"use client";

import { useState } from "react";
import useSWR from "swr";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StatusPill, type Field } from "@/components/Modal";
import { api, fetcher } from "@/lib/api";
import { useApp } from "@/lib/store";

interface Org {
  id: string;
  name: string;
  type: string;
  status: string;
  registrationNumber: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  contactName: string | null;
}

const TYPES = ["CLIENT", "CONSULTANT", "CONTRACTOR", "SUBCONTRACTOR", "SUPPLIER", "OTHER"];

// Full create form — identity, registration, address, primary contact.
const CREATE_FIELDS: Field[] = [
  { name: "name", label: "Organization name", required: true, placeholder: "Acme Civil Division" },
  { name: "type", label: "Type", type: "select", required: true, options: TYPES.map((t) => ({ value: t, label: t })) },
  { name: "registrationNumber", label: "Registration number", placeholder: "CN-12345" },
  { name: "taxNumber", label: "Tax / VAT number", placeholder: "AE100..." },
  { name: "website", label: "Website", placeholder: "https://acme.com" },
  { name: "addressLine1", label: "Address line 1", placeholder: "Building / street" },
  { name: "addressLine2", label: "Address line 2" },
  { name: "city", label: "City", placeholder: "Dubai" },
  { name: "state", label: "State / Province" },
  { name: "postalCode", label: "Postal code" },
  { name: "country", label: "Country (ISO-2)", placeholder: "AE" },
  { name: "phone", label: "Organization phone", placeholder: "+971 4 000 0000" },
  { name: "contactName", label: "Contact person name", placeholder: "Jane Smith" },
  { name: "contactEmail", label: "Contact email", placeholder: "jane@acme.com" },
  { name: "contactPhone", label: "Contact number", placeholder: "+971 50 000 0000" },
];

export default function OrganizationsPage() {
  const { me } = useApp();
  const isSuperAdmin = !!me?.permissions.includes("*");
  const [showCreate, setShowCreate] = useState(false);
  const { data, mutate, isLoading } = useSWR<{ items: Org[] }>("/organizations", fetcher);

  async function create(v: Record<string, string>) {
    const payload: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) if (val !== "") payload[k] = val;
    if (!payload.type) payload.type = "OTHER";
    await api.post("/organizations", payload);
    await mutate();
  }

  const items = data?.items ?? [];

  return (
    <Shell>
      <PageHeader
        title="Organizations"
        subtitle={`${items.length} organisation(s) in this tenant`}
        action={
          isSuperAdmin ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ New Organization</button>
          ) : (
            <span className="muted">Only a super admin can create organizations</span>
          )
        }
      />

      {isLoading ? (
        <div className="center-msg">Loading…</div>
      ) : (
        <div className="table-card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Type</th><th>Reg. No.</th><th>Contact</th><th>Location</th><th>Status</th></tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty">No organisations yet{isSuperAdmin ? " — create the first one." : "."}</div></td></tr>
                ) : items.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.name}</td>
                    <td><StatusPill value={o.type} /></td>
                    <td style={{ fontSize: 12, color: "#64748b" }}>{o.registrationNumber ?? "—"}</td>
                    <td style={{ fontSize: 12 }}>
                      {o.contactName ?? "—"}{o.phone ? <div style={{ color: "#64748b" }}>{o.phone}</div> : null}
                    </td>
                    <td style={{ fontSize: 12, color: "#64748b" }}>{[o.city, o.country].filter(Boolean).join(", ") || "—"}</td>
                    <td><StatusPill value={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && isSuperAdmin && (
        <Modal
          title="Create Organization"
          submitLabel="Create organization"
          fields={CREATE_FIELDS}
          onClose={() => setShowCreate(false)}
          onSubmit={create}
        />
      )}
    </Shell>
  );
}
