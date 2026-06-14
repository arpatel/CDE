import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { prisma } from "@cde/db";
import { parse } from "./validation.js";
import { ApiError } from "./errors.js";
import { audit } from "./audit.js";
import { ctx, requirePermission } from "../middleware/authenticate.js";

// Generic project-scoped resource module. Generates the standard
// list/create/get/patch/delete surface with tenant isolation, optional
// auto-numbering, soft delete, optimistic-lock bump, and audit logging —
// the pattern repeated across ~15 domain modules of the spec.

export interface CrudConfig {
  /** URL segment, e.g. "rfis" */
  plural: string;
  /** Prisma delegate name, e.g. "rfi" */
  delegate: string;
  /** Permission prefix, e.g. "rfi" → rfi:read / rfi:create / rfi:update */
  permission: string;
  /** resourceType used in audit + URLs */
  resourceType: string;
  createSchema: z.ZodTypeAny;
  updateSchema: z.ZodTypeAny;
  /** Auto-generate a sequential human number when omitted. */
  numbering?: { field: string; prefix: string };
  softDelete?: boolean;
  /** Column that records the creator (varies: createdBy/raisedBy/...). null to skip. */
  createdByField?: string | null;
  /** Extra relations to include on GET/list. */
  include?: Record<string, unknown>;
  /** Field names that are valid equality filters via ?filter[x]=. */
  filterable?: string[];
}

function delegateOf(name: string): any {
  const d = (prisma as unknown as Record<string, unknown>)[name];
  if (!d) throw new Error(`Unknown prisma delegate: ${name}`);
  return d;
}

export function registerCrud(app: FastifyInstance, cfg: CrudConfig): void {
  const base = `/projects/:projectId/${cfg.plural}`;
  const createdByField = cfg.createdByField === undefined ? "createdBy" : cfg.createdByField;
  const softDelete = cfg.softDelete ?? true;
  const model = () => delegateOf(cfg.delegate);

  async function assertProject(tenantId: string, projectId: string) {
    const p = await prisma.project.findFirst({
      where: { id: projectId, tenantId, isDeleted: false },
    });
    if (!p) throw ApiError.notFound("Project not found");
  }

  function scope(tenantId: string, projectId: string) {
    return softDelete
      ? { tenantId, projectId, isDeleted: false }
      : { tenantId, projectId };
  }

  // LIST
  app.get(base, { preHandler: requirePermission(`${cfg.permission}:read`) }, async (req) => {
    const { tenantId } = ctx(req);
    const { projectId } = req.params as { projectId: string };
    const query = (req.query ?? {}) as Record<string, any>;
    const where: Record<string, unknown> = scope(tenantId, projectId);
    const filter = query.filter ?? {};
    for (const f of cfg.filterable ?? []) {
      if (filter[f] !== undefined) where[f] = filter[f];
    }
    const items = await model().findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(cfg.include ? { include: cfg.include } : {}),
      take: Math.min(Number(query.limit) || 50, 200),
    });
    return { items, total: items.length };
  });

  // CREATE
  app.post(base, { preHandler: requirePermission(`${cfg.permission}:create`) }, async (req, reply) => {
    const { tenantId, userId } = ctx(req);
    const { projectId } = req.params as { projectId: string };
    await assertProject(tenantId, projectId);
    const body = parse(cfg.createSchema, req.body) as Record<string, unknown>;

    const data: Record<string, unknown> = { ...body, tenantId, projectId };
    if (createdByField) data[createdByField] = userId;

    if (cfg.numbering && !data[cfg.numbering.field]) {
      const count = await model().count({ where: { tenantId, projectId } });
      data[cfg.numbering.field] = `${cfg.numbering.prefix}-${String(count + 1).padStart(3, "0")}`;
    }

    const created = await model()
      .create({ data })
      .catch((e: { code?: string }) => {
        if (e.code === "P2002") throw ApiError.conflict(`Duplicate ${cfg.resourceType}`);
        throw e;
      });

    await audit({
      tenantId,
      userId,
      action: `${cfg.resourceType}.created`,
      resourceType: cfg.resourceType,
      resourceId: created.id,
      changes: body,
      ip: req.ip,
    });
    return reply.code(201).send(created);
  });

  // GET
  app.get(`${base}/:id`, { preHandler: requirePermission(`${cfg.permission}:read`) }, async (req) => {
    const { tenantId } = ctx(req);
    const { projectId, id } = req.params as { projectId: string; id: string };
    const item = await model().findFirst({
      where: { id, ...scope(tenantId, projectId) },
      ...(cfg.include ? { include: cfg.include } : {}),
    });
    if (!item) throw ApiError.notFound();
    return item;
  });

  // PATCH
  app.patch(`${base}/:id`, { preHandler: requirePermission(`${cfg.permission}:update`) }, async (req) => {
    const { tenantId, userId } = ctx(req);
    const { projectId, id } = req.params as { projectId: string; id: string };
    const existing = await model().findFirst({ where: { id, ...scope(tenantId, projectId) } });
    if (!existing) throw ApiError.notFound();
    const body = parse(cfg.updateSchema, req.body) as Record<string, unknown>;
    const data: Record<string, unknown> = { ...body };
    if ("version" in existing) data.version = { increment: 1 };
    const updated = await model().update({ where: { id }, data });
    await audit({
      tenantId,
      userId,
      action: `${cfg.resourceType}.updated`,
      resourceType: cfg.resourceType,
      resourceId: id,
      changes: body,
      ip: req.ip,
    });
    return updated;
  });

  // DELETE (soft when supported)
  app.delete(`${base}/:id`, { preHandler: requirePermission(`${cfg.permission}:update`) }, async (req, reply) => {
    const { tenantId, userId } = ctx(req);
    const { projectId, id } = req.params as { projectId: string; id: string };
    const existing = await model().findFirst({ where: { id, ...scope(tenantId, projectId) } });
    if (!existing) throw ApiError.notFound();
    if (softDelete) {
      await model().update({ where: { id }, data: { isDeleted: true } });
    } else {
      await model().delete({ where: { id } });
    }
    await audit({
      tenantId,
      userId,
      action: `${cfg.resourceType}.deleted`,
      resourceType: cfg.resourceType,
      resourceId: id,
      ip: req.ip,
    });
    return reply.code(204).send();
  });
}
