import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Integration helpers for the OnlyOffice Document Server (in-browser editing).
//
// Two distinct token uses, both keyed on ONLYOFFICE_JWT_SECRET:
//  1. Config / callback signing — OnlyOffice's own protocol requirement. We sign
//     the DocEditor config we hand to the browser; the Doc Server signs the
//     save-back callback. Same shared secret on both sides.
//  2. Editor URL access — a doc-scoped, long-ish-lived token embedded in the
//     file `contents` + `callback` URLs. The Doc Server (a Docker container)
//     can't send our Bearer header, so the URL itself carries authorisation.

const ISSUER = "cde-platform";

// Must comfortably outlast a real editing session.
const EDITOR_ACCESS_TTL = 12 * 60 * 60; // 12h

export interface EditorAccessClaims {
  sub: string; // userId
  tenantId: string;
  projectId: string;
  documentId: string;
  purpose: "editor";
}

// Sign the DocEditor config object so the Doc Server trusts it (JWT_ENABLED).
export function signConfigToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, env.ONLYOFFICE_JWT_SECRET, { expiresIn: 60 * 60 });
}

// Verify a token the Doc Server signed (the save-back callback body / header).
export function verifyDsToken<T = Record<string, unknown>>(token: string): T {
  return jwt.verify(token, env.ONLYOFFICE_JWT_SECRET) as T;
}

// Mint the doc-scoped token embedded in contents/callback URLs.
export function signEditorAccess(claims: Omit<EditorAccessClaims, "purpose">): string {
  return jwt.sign({ ...claims, purpose: "editor" }, env.ONLYOFFICE_JWT_SECRET, {
    expiresIn: EDITOR_ACCESS_TTL,
    issuer: ISSUER,
  });
}

export function verifyEditorAccess(token: string): EditorAccessClaims {
  const claims = jwt.verify(token, env.ONLYOFFICE_JWT_SECRET, { issuer: ISSUER }) as EditorAccessClaims;
  if (claims.purpose !== "editor") throw new Error("Not an editor token");
  return claims;
}

// OnlyOffice editable office formats (we gate "Edit online" to these).
const EDITABLE_EXT = new Set(["docx", "xlsx", "pptx", "odt", "ods", "odp", "csv", "txt"]);

export function fileExt(name: string): string {
  const n = (name || "").toLowerCase();
  return n.includes(".") ? n.slice(n.lastIndexOf(".") + 1) : "";
}

export function isEditableOffice(name: string): boolean {
  return EDITABLE_EXT.has(fileExt(name));
}

// OnlyOffice groups editors by document type derived from the extension.
export function documentTypeFor(ext: string): "word" | "cell" | "slide" {
  if (["xlsx", "xls", "xlsm", "ods", "csv"].includes(ext)) return "cell";
  if (["pptx", "ppt", "odp"].includes(ext)) return "slide";
  return "word";
}
