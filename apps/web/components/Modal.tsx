"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "@/lib/api";

export interface Field {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select" | "number";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export function Modal({
  title,
  fields,
  submitLabel = "Create",
  onClose,
  onSubmit,
}: {
  title: string;
  fields: Field[];
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <form onSubmit={submit}>
          {fields.map((f) => (
            <div className="field" key={f.name}>
              <label>{f.label}{f.required ? " *" : ""}</label>
              {f.type === "textarea" ? (
                <textarea
                  rows={3}
                  required={f.required}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              ) : f.type === "select" ? (
                <select
                  required={f.required}
                  defaultValue=""
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                >
                  <option value="" disabled>Select…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type ?? "text"}
                  required={f.required}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
              )}
            </div>
          ))}
          {error && <div className="error-text">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="page-hdr">
      <div>
        <div className="page-title">{title}</div>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ value }: { value?: string | null }) {
  const v = (value ?? "").toLowerCase();
  const cls =
    v.includes("approv") || v.includes("complet") || v.includes("closed") && !v.includes("dispute")
      ? "status-approved"
      : v.includes("reject") || v.includes("void") || v.includes("overdue")
      ? "status-rejected"
      : v.includes("pending") || v.includes("review") || v.includes("progress")
      ? "status-pending"
      : v.includes("draft") || v === "archived"
      ? "status-closed"
      : "status-open";
  return <span className={`status-pill ${cls}`}>{value ?? "—"}</span>;
}
