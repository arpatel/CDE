import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@cde/db";
import { ApiError } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";
import { authenticate, ctx, requirePermission } from "../../middleware/authenticate.js";
import { assertProjectAccess } from "../../lib/access.js";
import { streamFor } from "../../lib/storage.js";
import { env } from "../../config/env.js";
import {
  signConfigToken,
  verifyDsToken,
  signEditorAccess,
  verifyEditorAccess,
  fileExt,
  isEditableOffice,
  documentTypeFor,
  type EditorAccessClaims,
} from "../../lib/onlyoffice.js";
import { createRevisionFromBuffer, folderLevelFor, LEVEL_RANK } from "./document.routes.js";

// OnlyOffice Document Server integration. Three endpoints:
//   editor-config   (Bearer)  → signed DocEditor config + checks out the doc
//   editor-contents (URL token) → streams the file for the DS to load
//   editor-callback (URL token + DS-signed body) → save-back as a new revision
//
// The contents/callback routes can't carry our Bearer header (the DS is a Docker
// container), so the URL carries a doc-scoped editor token instead.

// Verify the URL token and confirm it is scoped to this exact document.
function editorClaims(req: FastifyRequest, projectId: string, documentId: string): EditorAccessClaims {
  const token = (req.query as { token?: string } | undefined)?.token;
  if (!token) throw ApiError.unauthorized("Missing editor token");
  let claims: EditorAccessClaims;
  try {
    claims = verifyEditorAccess(token);
  } catch {
    throw ApiError.unauthorized("Invalid or expired editor token");
  }
  if (claims.projectId !== projectId || claims.documentId !== documentId) {
    throw ApiError.forbidden("Editor token does not match this document");
  }
  return claims;
}

export async function editorRoutes(app: FastifyInstance): Promise<void> {
  // ── Editor config: launch an editing session (Bearer-authenticated) ───────
  app.get(
    "/projects/:projectId/documents/:id/editor-config",
    { preHandler: [authenticate, requirePermission("document:read")] },
    async (req) => {
      const { tenantId, userId, permissions } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      await assertProjectAccess(ctx(req), projectId);

      const doc = await prisma.document.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
      if (!doc) throw ApiError.notFound("Document not found");
      if (!doc.currentRevisionId) throw ApiError.unprocessable("Document has no uploaded file to edit");

      // Editing requires "Can upload" (edit) on the folder.
      const lvl = await folderLevelFor(tenantId, projectId, userId, permissions, doc.folderId);
      if (LEVEL_RANK[lvl] < LEVEL_RANK.edit) {
        throw ApiError.forbidden("You don't have edit access to this folder");
      }

      const rev = await prisma.documentRevision.findFirst({ where: { id: doc.currentRevisionId, documentId: id } });
      if (!rev) throw ApiError.notFound("Current revision not found");
      const name = rev.originalName ?? doc.title;
      const ext = fileExt(name);
      if (!isEditableOffice(name)) throw ApiError.unprocessable(`This file type (${ext || "unknown"}) cannot be edited online`);

      // Single-editor lock: take/refresh the checkout; block if held by another.
      if (doc.lockedBy && doc.lockedBy !== userId) {
        throw ApiError.conflict("Document is checked out by another user");
      }
      await prisma.document.update({ where: { id }, data: { lockedBy: userId, lockedAt: new Date() } });
      await audit({ tenantId, userId, action: "document.checked_out", resourceType: "document", resourceId: id, ip: req.ip });

      const editor = await prisma.user.findFirst({ where: { id: userId }, select: { displayName: true, email: true } });
      const token = signEditorAccess({ sub: userId, tenantId, projectId, documentId: id });
      const base = `${env.API_INTERNAL_URL}/projects/${projectId}/documents/${id}`;

      const config: Record<string, unknown> = {
        documentType: documentTypeFor(ext),
        document: {
          fileType: ext,
          // Key must change whenever content changes — each save makes a new
          // revision (new id), so binding it to the revision id is correct.
          key: rev.id,
          title: name,
          url: `${base}/revisions/${rev.id}/editor-contents?token=${token}`,
          permissions: { edit: true, download: true, print: true },
        },
        editorConfig: {
          mode: "edit",
          lang: "en",
          callbackUrl: `${base}/editor-callback?token=${token}`,
          user: { id: userId, name: editor?.displayName ?? editor?.email ?? "User" },
          customization: { forcesave: false, compactHeader: true },
        },
      };
      config.token = signConfigToken(config);

      return { config, documentServerUrl: env.ONLYOFFICE_PUBLIC_URL };
    },
  );

  // ── Editor contents: the DS downloads the file to open (URL-token auth) ───
  app.get(
    "/projects/:projectId/documents/:id/revisions/:revId/editor-contents",
    async (req, reply: FastifyReply) => {
      const { projectId, id, revId } = req.params as { projectId: string; id: string; revId: string };
      const claims = editorClaims(req, projectId, id);
      const rev = await prisma.documentRevision.findFirst({ where: { id: revId, documentId: id } });
      if (!rev || !rev.fileKey) throw ApiError.notFound("File not found");
      // Defence in depth: the revision must belong to the token's tenant's doc.
      const doc = await prisma.document.findFirst({ where: { id, tenantId: claims.tenantId, projectId }, select: { id: true } });
      if (!doc) throw ApiError.notFound();
      reply.header("Content-Type", rev.mimeType ?? "application/octet-stream");
      return reply.send(streamFor(rev.fileKey));
    },
  );

  // ── Editor callback: the DS posts the saved file → new revision ───────────
  app.post(
    "/projects/:projectId/documents/:id/editor-callback",
    async (req) => {
      const { projectId, id } = req.params as { projectId: string; id: string };
      const claims = editorClaims(req, projectId, id);

      // With JWT enabled the DS signs the body; verify it before trusting fields.
      const raw = (req.body ?? {}) as { token?: string };
      if (!raw.token) throw ApiError.unauthorized("Missing callback token");
      let payload: { status: number; url?: string; users?: string[]; key?: string };
      try {
        payload = verifyDsToken<typeof payload>(raw.token);
      } catch {
        throw ApiError.unauthorized("Invalid callback signature");
      }

      const tenantId = claims.tenantId;
      const status = payload.status;

      // 2 = ready to save (all editors closed); 6 = forcesave while editing.
      if (status === 2 || status === 6) {
        const doc = await prisma.document.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
        if (!doc) throw ApiError.notFound();
        if (!payload.url) throw ApiError.unprocessable("Callback missing file url");

        // Fetch the edited file from the DS. payload.url points at the DS's own
        // host; rewrite its origin to the reachable public URL.
        const fetchUrl = new URL(payload.url);
        const pub = new URL(env.ONLYOFFICE_PUBLIC_URL);
        fetchUrl.protocol = pub.protocol;
        fetchUrl.host = pub.host;
        const res = await fetch(fetchUrl.toString());
        if (!res.ok) throw ApiError.unprocessable(`Could not fetch edited file (${res.status})`);
        const buffer = Buffer.from(await res.arrayBuffer());

        const cur = doc.currentRevisionId
          ? await prisma.documentRevision.findFirst({ where: { id: doc.currentRevisionId, documentId: id } })
          : null;
        const uploaderId = payload.users?.[0] ?? claims.sub;

        await createRevisionFromBuffer({
          tenantId,
          projectId,
          documentId: id,
          buffer,
          filename: cur?.originalName ?? doc.title,
          mimeType: cur?.mimeType ?? null,
          uploaderId,
          status: doc.status,
          purposeOfIssue: cur?.purposeOfIssue ?? "For Information",
          revisionNotes: "Edited online (OnlyOffice)",
          ip: req.ip,
        });

        // Final save → release the lock (check in). Forcesave keeps editing.
        if (status === 2) {
          await prisma.document.update({ where: { id }, data: { lockedBy: null, lockedAt: null } });
          await audit({ tenantId, userId: uploaderId, action: "document.checked_in", resourceType: "document", resourceId: id, ip: req.ip });
        }
        return { error: 0 };
      }

      // 4 = closed with no changes → release the lock.
      if (status === 4) {
        await prisma.document.update({ where: { id }, data: { lockedBy: null, lockedAt: null } }).catch(() => undefined);
        return { error: 0 };
      }

      // 1 = editing started; 3/7 = save errors (acknowledge so the DS stops retrying).
      return { error: 0 };
    },
  );
}
