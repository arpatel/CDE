import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@cde/db";
import { parse } from "../../lib/validation.js";
import { ApiError } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";
import { authenticate, ctx, requirePermission } from "../../middleware/authenticate.js";
import { isBlockedFile, sanitizeFilename, saveBuffer, streamFor } from "../../lib/storage.js";

interface UploadedFile {
  fieldname: string;
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

async function assertProject(tenantId: string, projectId: string) {
  const p = await prisma.project.findFirst({ where: { id: projectId, tenantId, isDeleted: false } });
  if (!p) throw ApiError.notFound("Project not found");
  return p;
}

// Drain a multipart request into text fields + buffered files.
async function readMultipart(req: FastifyRequest): Promise<{
  fields: Record<string, string>;
  files: Record<string, UploadedFile>;
}> {
  if (!req.isMultipart()) throw ApiError.badRequest("Expected multipart/form-data");
  const fields: Record<string, string> = {};
  const files: Record<string, UploadedFile> = {};
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      files[part.fieldname] = {
        fieldname: part.fieldname,
        filename: part.filename,
        mimetype: part.mimetype,
        buffer,
      };
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }
  return { fields, files };
}

function baseName(filename: string): string {
  return path.basename(filename, path.extname(filename));
}

function revFileKey(tenantId: string, projectId: string, docId: string, revId: string, filename: string) {
  return `${tenantId}/${projectId}/${docId}/${revId}/${sanitizeFilename(filename)}`;
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // ── Folders (with auto-derivation settings) ──────────────────────────────
  const FolderSchema = z.object({
    name: z.string().min(1).max(160),
    parentId: z.string().uuid().optional(),
    docNumberPrefix: z.string().max(40).optional(),
    defaultStatus: z.string().max(40).optional(),
    defaultPurpose: z.string().max(60).optional(),
  });

  app.get("/projects/:projectId/folders", { preHandler: requirePermission("document:read") }, async (req) => {
    const { tenantId } = ctx(req);
    const { projectId } = req.params as { projectId: string };
    const items = await prisma.folder.findMany({
      where: { tenantId, projectId, isDeleted: false },
      orderBy: { name: "asc" },
    });
    return { items, total: items.length };
  });

  app.post("/projects/:projectId/folders", { preHandler: requirePermission("document:create") }, async (req, reply) => {
    const { tenantId, userId } = ctx(req);
    const { projectId } = req.params as { projectId: string };
    await assertProject(tenantId, projectId);
    const body = parse(FolderSchema, req.body);
    let pathStr = "/";
    if (body.parentId) {
      const parent = await prisma.folder.findFirst({ where: { id: body.parentId, tenantId, projectId } });
      if (!parent) throw ApiError.unprocessable("Parent folder not found");
      pathStr = `${parent.path === "/" ? "" : parent.path}/${parent.name}`;
    }
    const folder = await prisma.folder.create({
      data: { tenantId, projectId, createdBy: userId, path: pathStr, ...body },
    });
    await audit({ tenantId, userId, action: "folder.created", resourceType: "folder", resourceId: folder.id, ip: req.ip });
    return reply.code(201).send(folder);
  });

  // ── Publish a document (new doc + first revision, with attributes) ───────
  app.post(
    "/projects/:projectId/documents/publish",
    { preHandler: requirePermission("document:create") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { projectId } = req.params as { projectId: string };
      const project = await assertProject(tenantId, projectId);
      const { fields, files } = await readMultipart(req);

      const primary = files.file;
      if (!primary) throw ApiError.badRequest("A primary file is required (field 'file')");
      if (isBlockedFile(primary.filename)) {
        throw ApiError.unprocessable(`File type not allowed: ${primary.filename}`);
      }
      const secondary = files.secondaryFile;
      if (secondary && isBlockedFile(secondary.filename)) {
        throw ApiError.unprocessable(`Secondary file type not allowed: ${secondary.filename}`);
      }

      // Auto-derive system attributes from folder / project settings.
      const folder = fields.folderId
        ? await prisma.folder.findFirst({ where: { id: fields.folderId, tenantId, projectId } })
        : null;
      if (fields.folderId && !folder) throw ApiError.unprocessable("Folder not found in this project");

      const folderId = folder?.id ?? null;
      const prefix = folder?.docNumberPrefix || project.code;
      const provided = fields.docNumber?.trim();
      let docNumber: string;
      if (provided) {
        // Doc Ref must be unique within the folder (root = no folder).
        const dup = await prisma.document.findFirst({
          where: { tenantId, projectId, folderId, docNumber: provided, isDeleted: false },
        });
        if (dup) throw ApiError.conflict(`Doc Ref "${provided}" already exists in this folder`);
        docNumber = provided;
      } else {
        const count = await prisma.document.count({ where: { tenantId, projectId, folderId } });
        docNumber = await nextFreeDocNumber(tenantId, projectId, folderId, prefix, count + 1);
      }
      const title = fields.title?.trim() || baseName(primary.filename);
      const status = fields.status?.trim() || folder?.defaultStatus || "S0-WIP";
      const purposeOfIssue = fields.purposeOfIssue?.trim() || folder?.defaultPurpose || "For Information";
      const revisionLabel = fields.revisionLabel?.trim() || "P01";
      const type = fields.type?.trim() || "general";

      const docId = randomUUID();
      const revId = randomUUID();
      const fileKey = revFileKey(tenantId, projectId, docId, revId, primary.filename);
      const saved = await saveBuffer(fileKey, primary.buffer);
      let secondaryFileKey: string | null = null;
      if (secondary) {
        secondaryFileKey = revFileKey(tenantId, projectId, docId, revId, `secondary_${secondary.filename}`);
        await saveBuffer(secondaryFileKey, secondary.buffer);
      }

      const result = await prisma.$transaction(async (tx) => {
        const doc = await tx.document.create({
          data: {
            id: docId,
            tenantId,
            projectId,
            folderId: folder?.id ?? null,
            title,
            docNumber,
            type,
            status,
            createdBy: userId,
          },
        });
        const rev = await tx.documentRevision.create({
          data: {
            id: revId,
            documentId: docId,
            revisionNumber: 1,
            revisionLabel,
            fileKey,
            originalName: primary.filename,
            fileSize: BigInt(saved.size),
            mimeType: primary.mimetype,
            checksum: saved.checksum,
            uploaderId: userId,
            status,
            purposeOfIssue,
            revisionNotes: fields.revisionNotes?.trim() || null,
            secondaryFileKey,
            secondaryName: secondary?.filename ?? null,
          },
        });
        await tx.document.update({ where: { id: docId }, data: { currentRevisionId: rev.id } });
        return { doc, rev };
      });

      await audit({
        tenantId, userId, action: "document.published", resourceType: "document", resourceId: docId,
        changes: { docNumber, title, revisionLabel, status, purposeOfIssue }, ip: req.ip,
      });
      return reply.code(201).send(serializeRevisionDoc(result.doc, result.rev));
    },
  );

  // ── Add a new revision to an existing document ───────────────────────────
  app.post(
    "/projects/:projectId/documents/:id/revise",
    { preHandler: requirePermission("document:update") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const doc = await prisma.document.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
      if (!doc) throw ApiError.notFound();
      const { fields, files } = await readMultipart(req);
      const primary = files.file;
      if (!primary) throw ApiError.badRequest("A primary file is required (field 'file')");
      if (isBlockedFile(primary.filename)) throw ApiError.unprocessable(`File type not allowed: ${primary.filename}`);
      const secondary = files.secondaryFile;
      if (secondary && isBlockedFile(secondary.filename)) throw ApiError.unprocessable("Secondary file type not allowed");

      const count = await prisma.documentRevision.count({ where: { documentId: id } });
      const revId = randomUUID();
      const fileKey = revFileKey(tenantId, projectId, id, revId, primary.filename);
      const saved = await saveBuffer(fileKey, primary.buffer);
      let secondaryFileKey: string | null = null;
      if (secondary) {
        secondaryFileKey = revFileKey(tenantId, projectId, id, revId, `secondary_${secondary.filename}`);
        await saveBuffer(secondaryFileKey, secondary.buffer);
      }
      const status = fields.status?.trim() || doc.status;
      const rev = await prisma.documentRevision.create({
        data: {
          id: revId,
          documentId: id,
          revisionNumber: count + 1,
          revisionLabel: fields.revisionLabel?.trim() || `P${String(count + 1).padStart(2, "0")}`,
          fileKey,
          originalName: primary.filename,
          fileSize: BigInt(saved.size),
          mimeType: primary.mimetype,
          checksum: saved.checksum,
          uploaderId: userId,
          status,
          purposeOfIssue: fields.purposeOfIssue?.trim() || "For Information",
          revisionNotes: fields.revisionNotes?.trim() || null,
          secondaryFileKey,
          secondaryName: secondary?.filename ?? null,
        },
      });
      const updated = await prisma.document.update({
        where: { id },
        data: { currentRevisionId: rev.id, status, version: { increment: 1 } },
      });
      await audit({ tenantId, userId, action: "document.revised", resourceType: "document", resourceId: id, changes: { revisionLabel: rev.revisionLabel }, ip: req.ip });
      return reply.code(201).send(serializeRevisionDoc(updated, rev));
    },
  );

  // ── List revisions (with attributes) ─────────────────────────────────────
  app.get("/projects/:projectId/documents/:id/revisions", { preHandler: requirePermission("document:read") }, async (req) => {
    const { tenantId } = ctx(req);
    const { projectId, id } = req.params as { projectId: string; id: string };
    const doc = await prisma.document.findFirst({ where: { id, tenantId, projectId } });
    if (!doc) throw ApiError.notFound();
    const revisions = await prisma.documentRevision.findMany({
      where: { documentId: id },
      orderBy: { revisionNumber: "desc" },
    });
    return { items: revisions.map(serializeRevision), total: revisions.length };
  });

  // ── Download a revision's file (primary or secondary) ────────────────────
  app.get(
    "/projects/:projectId/documents/:id/revisions/:revId/download",
    { preHandler: requirePermission("document:read") },
    async (req, reply: FastifyReply) => {
      const { tenantId } = ctx(req);
      const { projectId, id, revId } = req.params as { projectId: string; id: string; revId: string };
      const which = (req.query as { which?: string }).which;
      const doc = await prisma.document.findFirst({ where: { id, tenantId, projectId } });
      if (!doc) throw ApiError.notFound();
      const rev = await prisma.documentRevision.findFirst({ where: { id: revId, documentId: id } });
      if (!rev) throw ApiError.notFound("Revision not found");

      const isSecondary = which === "secondary";
      const key = isSecondary ? rev.secondaryFileKey : rev.fileKey;
      const name = isSecondary ? rev.secondaryName : rev.originalName;
      if (!key) throw ApiError.notFound("File not found");

      reply.header("Content-Type", rev.mimeType ?? "application/octet-stream");
      reply.header("Content-Disposition", `attachment; filename="${name ?? "download"}"`);
      return reply.send(streamFor(key));
    },
  );
}

function serializeRevision(rev: {
  id: string; revisionNumber: number; revisionLabel: string; originalName: string | null;
  fileSize: bigint; mimeType: string | null; status: string; purposeOfIssue: string | null;
  revisionNotes: string | null; secondaryName: string | null; uploaderId: string | null; createdAt: Date;
}) {
  return {
    id: rev.id,
    revisionNumber: rev.revisionNumber,
    revisionLabel: rev.revisionLabel,
    originalName: rev.originalName,
    fileSize: Number(rev.fileSize),
    mimeType: rev.mimeType,
    status: rev.status,
    purposeOfIssue: rev.purposeOfIssue,
    revisionNotes: rev.revisionNotes,
    secondaryName: rev.secondaryName,
    uploaderId: rev.uploaderId,
    createdAt: rev.createdAt,
  };
}

function serializeRevisionDoc(doc: { id: string; docNumber: string | null; title: string; status: string; currentRevisionId: string | null }, rev: Parameters<typeof serializeRevision>[0]) {
  return {
    id: doc.id,
    docNumber: doc.docNumber,
    title: doc.title,
    status: doc.status,
    currentRevisionId: doc.currentRevisionId,
    revision: serializeRevision(rev),
  };
}
