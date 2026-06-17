// Client-side CSV export — opens cleanly in Excel (UTF-8 BOM, CRLF, RFC-4180
// quoting). One helper powers the "Export" button on every listing.

export interface CsvColumn {
  /** Header label in the exported file. */
  label: string;
  /** Row property to read, when no custom value() is given. */
  key?: string;
  /** Custom cell value (use for nested fields / formatting). */
  value?: (row: Record<string, any>) => unknown;
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCsv(filename: string, columns: CsvColumn[], rows: Record<string, any>[]): void {
  const header = columns.map((c) => cell(c.label)).join(",");
  const body = rows.map((r) =>
    columns.map((c) => cell(c.value ? c.value(r) : c.key ? r[c.key] : "")).join(","),
  );
  const csv = "﻿" + [header, ...body].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = (filename.endsWith(".csv") ? filename.slice(0, -4) : filename) + `_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
