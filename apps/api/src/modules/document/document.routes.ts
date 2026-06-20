import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, Prisma } from "@cde/db";
import { parse } from "../../lib/validation.js";
import { ApiError } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";
import { authenticate, ctx, requirePermission, type AuthContext } from "../../middleware/authenticate.js";
import { assertProjectAccess } from "../../lib/access.js";
import { isBlockedFile, sanitizeFilename, saveBuffer, streamFor } from "../../lib/storage.js";

interface UploadedFile {
  fieldname: string;
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

// Enforces the caller's system-level data scope for this project.
async function assertProject(auth: AuthContext, projectId: string) {
  return assertProjectAccess(auth, projectId);
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

// Find the next Doc Ref that is free within the folder (Doc Ref is unique per folder).
async function nextFreeDocNumber(
  tenantId: string,
  projectId: string,
  folderId: string | null,
  prefix: string,
  startSeq: number,
): Promise<string> {
  let seq = startSeq;
  for (let i = 0; i < 100000; i++) {
    const candidate = `${prefix}-${String(seq).padStart(4, "0")}`;
    const exists = await prisma.document.findFirst({
      where: { tenantId, projectId, folderId, docNumber: candidate, isDeleted: false },
      select: { id: true },
    });
    if (!exists) return candidate;
    seq++;
  }
  throw ApiError.conflict("Could not allocate a unique Doc Ref");
}

// All role IDs a user holds in this tenant/project context: org-membership roles
// plus their project-member role. Used to resolve role-based folder grants.
async function userRoleIds(tenantId: string, projectId: string, userId: string): Promise<string[]> {
  const ids = new Set<string>();
  const orgRoles = await prisma.userOrgMembership.findMany({
    where: { userId, role: { tenantId } },
    select: { roleId: true },
  });
  for (const r of orgRoles) ids.add(r.roleId);
  const pms = await prisma.projectMember.findMany({
    where: { projectId, userId },
    select: { roleId: true },
  });
  for (const pm of pms) if (pm.roleId) ids.add(pm.roleId);
  return [...ids];
}

// Resolves which folders a user can see (with inheritance) plus per-folder
// restricted / grantCount / canManage flags. Shared by the folder tree and the
// document register so both apply the same access rules.
async function computeFolderAccess(
  tenantId: string,
  projectId: string,
  userId: string,
  permissions: Set<string>,
) {
  const folders = await prisma.folder.findMany({
    where: { tenantId, projectId, isDeleted: false },
    orderBy: { name: "asc" },
  });
  const grants = await prisma.folderPermission.findMany({
    where: { tenantId, folder: { projectId } },
  });
  const isSuper = permissions.has("*");
  const canManageAll = isSuper || permissions.has("document:delete");
  const roleIds = isSuper ? [] : await userRoleIds(tenantId, projectId, userId);

  const byFolder = new Map<string, typeof grants>();
  for (const g of grants) {
    const arr = byFolder.get(g.folderId) ?? [];
    arr.push(g);
    byFolder.set(g.folderId, arr);
  }
  const folderById = new Map(folders.map((f) => [f.id, f]));

  const granted = (folderId: string, manageOnly = false): boolean => {
    const gs = byFolder.get(folderId);
    if (!gs) return false;
    return gs.some(
      (g) =>
        (!manageOnly || g.accessLevel === "manage") &&
        ((g.principalType === "user" && g.principalId === userId) ||
          (g.principalType === "role" && roleIds.includes(g.principalId))),
    );
  };
  const hasOwn = (id: string) => (byFolder.get(id)?.length ?? 0) > 0;
  // Nearest self-or-ancestor folder that has its OWN grants — that folder's ACL
  // governs this one (inherit-by-default; an own ACL overrides and becomes the
  // new source for its descendants). null ⇒ open (no ancestor restricts).
  const sourceCache = new Map<string, (typeof folders)[number] | null>();
  const sourceOf = (f: (typeof folders)[number]): (typeof folders)[number] | null => {
    const cached = sourceCache.get(f.id);
    if (cached !== undefined) return cached;
    let cur: (typeof folders)[number] | null = f;
    let src: (typeof folders)[number] | null = null;
    while (cur) {
      if (hasOwn(cur.id)) { src = cur; break; }
      cur = cur.parentId ? folderById.get(cur.parentId) ?? null : null;
    }
    sourceCache.set(f.id, src);
    return src;
  };
  const visible = (f: (typeof folders)[number]): boolean => {
    if (isSuper || canManageAll) return true;
    if (f.createdBy === userId) return true;
    const src = sourceOf(f);
    if (!src) return false; // private by default: no ACL ⇒ creator + admins only
    return granted(src.id);
  };

  const rows = folders.filter(visible).map((f) => {
    const src = sourceOf(f);
    return {
      ...f,
      restricted: !!src,
      inherited: !!src && src.id !== f.id,
      inheritedFromId: src && src.id !== f.id ? src.id : null,
      grantCount: byFolder.get(f.id)?.length ?? 0,
      canManage: canManageAll || f.createdBy === userId || (!!src && granted(src.id, true)),
    };
  });
  return { rows, visibleIds: new Set(rows.map((r) => r.id)), isSuper };
}

// Effective access a principal has on a specific folder, honouring inheritance
// and the private-by-default rule. Levels rank none < view < edit < manage.
//   view   → can see the folder & its documents
//   edit   → can also upload / add revisions / edit metadata ("Can upload")
//   manage → can also change the folder's access ("Can manage")
// Root (folderId === null) carries no folder ACL, so it is governed purely by
// module permissions (treated as "manage" here — module guards still apply).
export type FolderLevel = "none" | "view" | "edit" | "manage";
export const LEVEL_RANK: Record<FolderLevel, number> = { none: 0, view: 1, edit: 2, manage: 3 };

export async function folderLevelFor(
  tenantId: string,
  projectId: string,
  userId: string,
  permissions: Set<string>,
  folderId: string | null,
): Promise<FolderLevel> {
  if (permissions.has("*") || permissions.has("document:delete")) return "manage";
  if (folderId == null) return "manage"; // root: no folder ACL to satisfy
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, tenantId, projectId, isDeleted: false },
    select: { id: true, parentId: true, createdBy: true },
  });
  if (!folder) return "none";
  if (folder.createdBy === userId) return "manage";

  const folders = await prisma.folder.findMany({
    where: { tenantId, projectId, isDeleted: false },
    select: { id: true, parentId: true },
  });
  const byId = new Map(folders.map((f) => [f.id, f]));
  const grants = await prisma.folderPermission.findMany({ where: { tenantId, folder: { projectId } } });
  const byFolder = new Map<string, typeof grants>();
  for (const g of grants) { const a = byFolder.get(g.folderId) ?? []; a.push(g); byFolder.set(g.folderId, a); }

  // Nearest self-or-ancestor with its own grants governs this folder.
  let cur: { id: string; parentId: string | null } | undefined = folder;
  let source: string | null = null;
  while (cur) {
    if ((byFolder.get(cur.id)?.length ?? 0) > 0) { source = cur.id; break; }
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  if (!source) return "none"; // private by default: no ACL ⇒ creator + admins only
  const roleIds = await userRoleIds(tenantId, projectId, userId);
  let best: FolderLevel = "none";
  for (const g of byFolder.get(source) ?? []) {
    const mine =
      (g.principalType === "user" && g.principalId === userId) ||
      (g.principalType === "role" && roleIds.includes(g.principalId));
    if (!mine) continue;
    const lvl = (g.accessLevel as FolderLevel) ?? "view";
    if (LEVEL_RANK[lvl] > LEVEL_RANK[best]) best = lvl;
  }
  return best;
}

// Resolve the active configurable attributes that apply to a folder: every
// active attribute belonging to an active set that is either project-level or
// folder-level and lists this folder in its locations.
async function applicableAttributes(tenantId: string, projectId: string, folderId: string | null) {
  const sets = await prisma.attributeSet.findMany({
    where: { tenantId, projectId, isDeleted: false, status: "active" },
    select: { id: true, name: true, hierarchy: true, locations: true },
  });
  const applicable = sets.filter(
    (s) =>
      s.hierarchy === "project" ||
      (s.hierarchy === "folder" && folderId != null && Array.isArray(s.locations) && (s.locations as string[]).includes(folderId)),
  );
  if (applicable.length === 0) return [] as ApplicableAttr[];
  const setName = new Map(applicable.map((s) => [s.id, s.name]));
  const attrs = await prisma.configurableAttribute.findMany({
    where: { tenantId, projectId, isDeleted: false, status: "active", setId: { in: applicable.map((s) => s.id) } },
    orderBy: { name: "asc" },
  });
  return attrs.map((a) => ({
    id: a.id,
    name: a.name,
    controlType: a.controlType,
    mandatory: a.mandatory,
    options: Array.isArray(a.options) ? (a.options as string[]) : [],
    defaultValue: a.defaultValue,
    setId: a.setId,
    setName: a.setId ? setName.get(a.setId) ?? null : null,
  }));
}
type ApplicableAttr = {
  id: string; name: string; controlType: string; mandatory: boolean;
  options: string[]; defaultValue: string | null; setId: string | null; setName: string | null;
};

function parseAttributesField(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

const AttributesSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  docNumber: z.string().max(120).optional(),
  status: z.string().max(40).optional(),
  type: z.string().max(60).optional(),
  purposeOfIssue: z.string().max(60).optional(),
  revisionNotes: z.string().max(2000).optional(),
  attributes: z.record(z.any()).optional(),
});

const GrantsSchema = z.object({
  grants: z
    .array(
      z.object({
        principalType: z.enum(["user", "role"]),
        principalId: z.string().uuid(),
        accessLevel: z.enum(["view", "edit", "manage"]).default("view"),
      }),
    )
    .max(500),
});

// Create a new revision from an in-memory buffer and point the document at it.
// Shared by the HTTP `revise` endpoint and the OnlyOffice save-back callback so
// both produce identical revisions (revisionNumber++, new uploader, version++).
export async function createRevisionFromBuffer(opts: {
  tenantId: string;
  projectId: string;
  documentId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string | null;
  uploaderId: string | null;
  status?: string;
  purposeOfIssue?: string;
  revisionLabel?: string;
  revisionNotes?: string | null;
  secondary?: { buffer: Buffer; filename: string } | null;
  ip?: string | null;
}) {
  const { tenantId, projectId, documentId, buffer, filename, mimeType, uploaderId } = opts;
  const count = await prisma.documentRevision.count({ where: { documentId } });
  const revId = randomUUID();
  const fileKey = revFileKey(tenantId, projectId, documentId, revId, filename);
  const saved = await saveBuffer(fileKey, buffer);
  let secondaryFileKey: string | null = null;
  if (opts.secondary) {
    secondaryFileKey = revFileKey(tenantId, projectId, documentId, revId, `secondary_${opts.secondary.filename}`);
    await saveBuffer(secondaryFileKey, opts.secondary.buffer);
  }
  const rev = await prisma.documentRevision.create({
    data: {
      id: revId,
      documentId,
      revisionNumber: count + 1,
      revisionLabel: opts.revisionLabel?.trim() || `P${String(count + 1).padStart(2, "0")}`,
      fileKey,
      originalName: filename,
      fileSize: BigInt(saved.size),
      mimeType,
      checksum: saved.checksum,
      uploaderId,
      status: opts.status ?? "uploaded",
      purposeOfIssue: opts.purposeOfIssue ?? "For Information",
      revisionNotes: opts.revisionNotes ?? null,
      secondaryFileKey,
      secondaryName: opts.secondary?.filename ?? null,
    },
  });
  const doc = await prisma.document.update({
    where: { id: documentId },
    data: { currentRevisionId: rev.id, ...(opts.status ? { status: opts.status } : {}), version: { increment: 1 } },
  });
  await audit({
    tenantId,
    userId: uploaderId,
    action: "document.revised",
    resourceType: "document",
    resourceId: documentId,
    changes: { revisionLabel: rev.revisionLabel },
    ip: opts.ip ?? null,
  });
  return { doc, rev };
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
    const { tenantId, userId, permissions } = ctx(req);
    const { projectId } = req.params as { projectId: string };
    const { rows } = await computeFolderAccess(tenantId, projectId, userId, permissions);
    return { items: rows, total: rows.length };
  });

  // Document register: docs in folders the caller can see, enriched with the
  // current revision's upload date + author (uploader name).
  app.get("/projects/:projectId/document-register", { preHandler: requirePermission("document:read") }, async (req) => {
    const { tenantId, userId, permissions } = ctx(req);
    const { projectId } = req.params as { projectId: string };
    await assertProject(ctx(req), projectId);
    const { visibleIds, isSuper } = await computeFolderAccess(tenantId, projectId, userId, permissions);

    const docs = await prisma.document.findMany({
      where: { tenantId, projectId, isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    // Root docs (no folder) are always visible; foldered docs require folder visibility.
    const filtered = docs.filter((d) => isSuper || d.folderId === null || visibleIds.has(d.folderId));

    const revIds = filtered.map((d) => d.currentRevisionId).filter((x): x is string => !!x);
    const revs = revIds.length
      ? await prisma.documentRevision.findMany({ where: { id: { in: revIds } } })
      : [];
    const revMap = new Map(revs.map((r) => [r.id, r]));

    const personIds = new Set<string>();
    for (const d of filtered) if (d.createdBy) personIds.add(d.createdBy);
    for (const r of revs) if (r.uploaderId) personIds.add(r.uploaderId);
    const users = personIds.size
      ? await prisma.user.findMany({ where: { id: { in: [...personIds] } }, select: { id: true, displayName: true, email: true } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const nameOf = (id: string | null | undefined) =>
      id ? userMap.get(id)?.displayName ?? userMap.get(id)?.email ?? "—" : "—";

    const items = filtered.map((d) => {
      const rev = d.currentRevisionId ? revMap.get(d.currentRevisionId) : null;
      const uploaderId = rev?.uploaderId ?? d.createdBy;
      return {
        id: d.id,
        docNumber: d.docNumber,
        title: d.title,
        status: d.status,
        folderId: d.folderId,
        currentRevisionId: d.currentRevisionId,
        revisionLabel: rev?.revisionLabel ?? null,
        fileName: rev?.originalName ?? null,
        attributes: d.attributes ?? {},
        uploadedAt: (rev?.createdAt ?? d.createdAt).toISOString(),
        uploadedBy: nameOf(uploaderId),
        createdAt: d.createdAt.toISOString(),
      };
    });
    return { items, total: items.length };
  });

  // Configurable attributes that apply when uploading into a given folder
  // (?folderId=…; omit for project root). Drives the dynamic upload form fields.
  app.get("/projects/:projectId/applicable-attributes", { preHandler: requirePermission("document:read") }, async (req) => {
    const { tenantId } = ctx(req);
    const { projectId } = req.params as { projectId: string };
    await assertProject(ctx(req), projectId);
    const folderId = (req.query as { folderId?: string }).folderId || null;
    const items = await applicableAttributes(tenantId, projectId, folderId);
    return { items, total: items.length };
  });

  // Principals that can be granted folder access: this project's members + tenant roles.
  app.get(
    "/projects/:projectId/folder-principals",
    { preHandler: requirePermission("document:read") },
    async (req) => {
      const { tenantId } = ctx(req);
      const { projectId } = req.params as { projectId: string };
      await assertProject(ctx(req), projectId);
      const members = await prisma.projectMember.findMany({
        where: { projectId },
        include: { user: { select: { id: true, displayName: true, email: true } } },
      });
      // Only roles assigned within THIS project belong in the access picker —
      // not org-level tiers or roles used only on other projects.
      const roleIds = [...new Set(members.map((m) => m.roleId).filter((x): x is string => !!x))];
      const roles = roleIds.length
        ? await prisma.role.findMany({
            where: { tenantId, id: { in: roleIds }, level: "project" },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : [];
      // A user can hold several roles ⇒ multiple membership rows. De-duplicate
      // so each project member appears once in the access picker.
      const usersById = new Map(members.map((m) => [m.user.id, m.user]));
      return {
        users: [...usersById.values()],
        roles,
      };
    },
  );

  // A folder's effective access grants: its OWN grants if any (independent),
  // otherwise the grants INHERITED from the nearest ancestor that has its own.
  app.get(
    "/projects/:projectId/folders/:id/permissions",
    { preHandler: requirePermission("document:read") },
    async (req) => {
      const { tenantId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const folder = await prisma.folder.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
      if (!folder) throw ApiError.notFound("Folder not found");

      const folders = await prisma.folder.findMany({
        where: { tenantId, projectId, isDeleted: false },
        select: { id: true, parentId: true, name: true },
      });
      const grants = await prisma.folderPermission.findMany({ where: { tenantId, folder: { projectId } } });
      const byFolder = new Map<string, typeof grants>();
      for (const g of grants) { const a = byFolder.get(g.folderId) ?? []; a.push(g); byFolder.set(g.folderId, a); }
      const byId = new Map(folders.map((f) => [f.id, f]));

      // Find the source folder: this folder if it has own grants, else nearest ancestor.
      let source: { id: string; name: string } | null = null;
      let cur: { id: string; parentId: string | null; name: string } | undefined = folder;
      while (cur) {
        if ((byFolder.get(cur.id)?.length ?? 0) > 0) { source = { id: cur.id, name: cur.name }; break; }
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      const own = (byFolder.get(id)?.length ?? 0) > 0;
      const effective = source ? byFolder.get(source.id) ?? [] : [];

      const userIds = effective.filter((g) => g.principalType === "user").map((g) => g.principalId);
      const roleIds = effective.filter((g) => g.principalType === "role").map((g) => g.principalId);
      const [users, roles] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } }),
        prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } }),
      ]);
      const userMap = new Map(users.map((u) => [u.id, u]));
      const roleMap = new Map(roles.map((r) => [r.id, r]));
      return {
        items: effective.map((g) => ({
          principalType: g.principalType,
          principalId: g.principalId,
          accessLevel: g.accessLevel,
          name:
            g.principalType === "user"
              ? userMap.get(g.principalId)?.displayName ?? userMap.get(g.principalId)?.email ?? "Unknown user"
              : roleMap.get(g.principalId)?.name ?? "Unknown role",
        })),
        own,                                            // folder has its own ACL (independent)
        inherited: !!source && !own,                    // showing grants inherited from an ancestor
        inheritedFrom: source && !own ? source : null,  // { id, name } of the ancestor
        restricted: !!source,
        total: effective.length,
      };
    },
  );

  // Replace a folder's OWN access grants. A non-empty list makes the folder
  // independent (its ACL overrides the parent). An empty list removes its own
  // grants so it reverts to inheriting from the nearest ancestor (or open).
  app.put(
    "/projects/:projectId/folders/:id/permissions",
    { preHandler: requirePermission("document:update") },
    async (req) => {
      const { tenantId, userId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const folder = await prisma.folder.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
      if (!folder) throw ApiError.notFound("Folder not found");
      // Only someone with "Can manage" on the folder (or its creator / an admin) may change access.
      const manageLvl = await folderLevelFor(tenantId, projectId, userId, ctx(req).permissions, id);
      if (LEVEL_RANK[manageLvl] < LEVEL_RANK.manage) {
        throw ApiError.forbidden("You don't have manage access to this folder");
      }
      const body = parse(GrantsSchema, req.body);

      // Validate every principal belongs to the tenant.
      for (const g of body.grants) {
        if (g.principalType === "user") {
          const u = await prisma.user.findFirst({ where: { id: g.principalId, tenantId }, select: { id: true } });
          if (!u) throw ApiError.unprocessable(`User ${g.principalId} not in this tenant`);
        } else {
          const r = await prisma.role.findFirst({ where: { id: g.principalId, tenantId }, select: { id: true } });
          if (!r) throw ApiError.unprocessable(`Role ${g.principalId} not in this tenant`);
        }
      }
      // De-duplicate by principal (last write wins).
      const unique = new Map(body.grants.map((g) => [`${g.principalType}:${g.principalId}`, g]));

      await prisma.$transaction(async (tx) => {
        await tx.folderPermission.deleteMany({ where: { tenantId, folderId: id } });
        if (unique.size > 0) {
          await tx.folderPermission.createMany({
            data: [...unique.values()].map((g) => ({
              tenantId,
              folderId: id,
              principalType: g.principalType,
              principalId: g.principalId,
              accessLevel: g.accessLevel,
              createdBy: userId,
            })),
          });
        }
      });
      await audit({
        tenantId, userId, action: "folder.permissions.updated", resourceType: "folder", resourceId: id,
        changes: { grants: unique.size }, ip: req.ip,
      });
      return { ok: true, total: unique.size };
    },
  );

  app.post("/projects/:projectId/folders", { preHandler: requirePermission("document:create") }, async (req, reply) => {
    const { tenantId, userId } = ctx(req);
    const { projectId } = req.params as { projectId: string };
    await assertProject(ctx(req), projectId);
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
      const project = await assertProject(ctx(req), projectId);
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
      // Per-folder access: uploading requires at least "Can upload" (edit) on the folder.
      const lvl = await folderLevelFor(tenantId, projectId, userId, ctx(req).permissions, folderId);
      if (LEVEL_RANK[lvl] < LEVEL_RANK.edit) {
        throw ApiError.forbidden("You don't have upload access to this folder");
      }
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

      // Configurable attribute values — validate against the sets applicable to
      // this folder, enforcing mandatory fields.
      const attrValues = parseAttributesField(fields.attributes);
      const applicable = await applicableAttributes(tenantId, projectId, folderId);
      const missing = applicable
        .filter((a) => a.mandatory && isEmptyValue(attrValues[a.id]))
        .map((a) => a.name);
      if (missing.length) throw ApiError.unprocessable(`Missing required attribute(s): ${missing.join(", ")}`);

      const docId = randomUUID();
      const revId = randomUUID();
      const fileKey = revFileKey(tenantId, projectId, docId, revId, primary.filename);
      const saved = await saveBuffer(fileKey, primary.buffer);
      let secondaryFileKey: string | null = null;
      if (secondary) {
        secondaryFileKey = revFileKey(tenantId, projectId, docId, revId, `secondary_${secondary.filename}`);
        await saveBuffer(secondaryFileKey, secondary.buffer);
      }

      const result = await prisma
        .$transaction(async (tx) => {
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
              attributes: attrValues as Prisma.InputJsonValue,
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
        })
        .catch((e: { code?: string }) => {
          // DB-level safety net (uq_document_docref_per_folder) for concurrent uploads.
          if (e.code === "P2002") throw ApiError.conflict(`Doc Ref "${docNumber}" already exists in this folder`);
          throw e;
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
      // Adding a revision requires at least "Can upload" (edit) on the doc's folder.
      const reviseLvl = await folderLevelFor(tenantId, projectId, userId, ctx(req).permissions, doc.folderId);
      if (LEVEL_RANK[reviseLvl] < LEVEL_RANK.edit) {
        throw ApiError.forbidden("You don't have upload access to this folder");
      }
      const { fields, files } = await readMultipart(req);
      const primary = files.file;
      if (!primary) throw ApiError.badRequest("A primary file is required (field 'file')");
      if (isBlockedFile(primary.filename)) throw ApiError.unprocessable(`File type not allowed: ${primary.filename}`);
      const secondary = files.secondaryFile;
      if (secondary && isBlockedFile(secondary.filename)) throw ApiError.unprocessable("Secondary file type not allowed");

      const { doc: updated, rev } = await createRevisionFromBuffer({
        tenantId,
        projectId,
        documentId: id,
        buffer: primary.buffer,
        filename: primary.filename,
        mimeType: primary.mimetype,
        uploaderId: userId,
        status: fields.status?.trim() || doc.status,
        purposeOfIssue: fields.purposeOfIssue?.trim() || "For Information",
        revisionLabel: fields.revisionLabel?.trim() || undefined,
        revisionNotes: fields.revisionNotes?.trim() || null,
        secondary: secondary ? { buffer: secondary.buffer, filename: secondary.filename } : null,
        ip: req.ip,
      });
      return reply.code(201).send(serializeRevisionDoc(updated, rev));
    },
  );

  // ── Edit document attributes (metadata) ──────────────────────────────────
  app.patch(
    "/projects/:projectId/documents/:id/attributes",
    { preHandler: requirePermission("document:update") },
    async (req) => {
      const { tenantId, userId } = ctx(req);
      const { projectId, id } = req.params as { projectId: string; id: string };
      const doc = await prisma.document.findFirst({ where: { id, tenantId, projectId, isDeleted: false } });
      if (!doc) throw ApiError.notFound("Document not found");
      // Editing metadata requires at least "Can upload" (edit) on the doc's folder.
      const attrLvl = await folderLevelFor(tenantId, projectId, userId, ctx(req).permissions, doc.folderId);
      if (LEVEL_RANK[attrLvl] < LEVEL_RANK.edit) {
        throw ApiError.forbidden("You don't have edit access to this folder");
      }
      const body = parse(AttributesSchema, req.body);

      // Doc-level fields.
      const docData: Record<string, unknown> = {};
      if (body.title !== undefined) docData.title = body.title.trim();
      if (body.type !== undefined) docData.type = body.type.trim();
      if (body.status !== undefined) docData.status = body.status.trim();
      if (body.docNumber !== undefined) {
        const next = body.docNumber.trim();
        if (next !== (doc.docNumber ?? "")) {
          // Doc Ref must stay unique within the folder.
          const dup = await prisma.document.findFirst({
            where: { tenantId, projectId, folderId: doc.folderId, docNumber: next, isDeleted: false, id: { not: id } },
            select: { id: true },
          });
          if (dup) throw ApiError.conflict(`Doc Ref "${next}" already exists in this folder`);
          docData.docNumber = next || null;
        }
      }

      // Configurable attribute values — re-validate mandatory ones for the folder.
      if (body.attributes !== undefined) {
        const merged = { ...(doc.attributes as Record<string, unknown>), ...body.attributes };
        const applicable = await applicableAttributes(tenantId, projectId, doc.folderId);
        const missing = applicable.filter((a) => a.mandatory && isEmptyValue(merged[a.id])).map((a) => a.name);
        if (missing.length) throw ApiError.unprocessable(`Missing required attribute(s): ${missing.join(", ")}`);
        docData.attributes = merged;
      }

      // Current-revision attributes (purpose / notes / status).
      const revData: Record<string, unknown> = {};
      if (body.purposeOfIssue !== undefined) revData.purposeOfIssue = body.purposeOfIssue.trim() || null;
      if (body.revisionNotes !== undefined) revData.revisionNotes = body.revisionNotes.trim() || null;
      if (body.status !== undefined) revData.status = body.status.trim();

      await prisma
        .$transaction(async (tx) => {
          if (Object.keys(docData).length) {
            await tx.document.update({ where: { id }, data: { ...docData, version: { increment: 1 } } });
          }
          if (Object.keys(revData).length && doc.currentRevisionId) {
            await tx.documentRevision.update({ where: { id: doc.currentRevisionId }, data: revData });
          }
        })
        .catch((e: { code?: string }) => {
          if (e.code === "P2002") throw ApiError.conflict(`Doc Ref "${docData.docNumber}" already exists in this folder`);
          throw e;
        });
      await audit({
        tenantId, userId, action: "document.attributes.updated", resourceType: "document", resourceId: id,
        changes: { ...docData, ...revData }, ip: req.ip,
      });
      return { ok: true, id };
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
