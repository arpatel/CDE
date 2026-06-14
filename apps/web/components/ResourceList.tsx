"use client";

import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { useApp } from "@/lib/store";
import { api, fetcher } from "@/lib/api";
import { Modal, PageHeader, StatusPill, type Field } from "./Modal";

export interface Column {
  key: string;
  label: string;
  render?: (row: Record<string, any>) => ReactNode;
}

export function ResourceList({
  title,
  plural,
  columns,
  createFields,
  createLabel = "New",
  subtitle,
}: {
  title: string;
  plural: string;
  columns: Column[];
  createFields: Field[];
  createLabel?: string;
  subtitle?: (count: number) => string;
}) {
  const { projectId } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const key = projectId ? `/projects/${projectId}/${plural}` : null;
  const { data, error, isLoading, mutate } = useSWR<{ items: Record<string, any>[]; total: number }>(key, fetcher);

  async function create(values: Record<string, string>) {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) if (v !== "") payload[k] = v;
    await api.post(`/projects/${projectId}/${plural}`, payload);
    await mutate();
  }

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle ? subtitle(data?.total ?? 0) : undefined}
        action={
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} disabled={!projectId}>
            + {createLabel}
          </button>
        }
      />

      {!projectId ? (
        <div className="empty">Select or create a project to continue.</div>
      ) : isLoading ? (
        <div className="center-msg">Loading…</div>
      ) : error ? (
        <div className="error-text">{String(error.message ?? error)}</div>
      ) : (
        <div className="table-card">
          <div className="table-toolbar">
            <span className="table-title">{items.length} {title}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={columns.length}><div className="empty">Nothing here yet — create the first one.</div></td></tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id}>
                      {columns.map((c) => (
                        <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? "—")}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <Modal
          title={`Create ${createLabel}`}
          fields={createFields}
          onClose={() => setShowCreate(false)}
          onSubmit={create}
        />
      )}
    </>
  );
}

export { StatusPill };
