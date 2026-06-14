import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@cde/db";
import { parse } from "../../lib/validation.js";
import { ApiError } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";
import { authenticate, ctx, requirePermission } from "../../middleware/authenticate.js";

const CreateSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(280).optional(),
  permissions: z.array(z.string()).default([]),
  // Data visibility level for users holding this role.
  dataScope: z.enum(["OWN", "OWN_ORG", "ALL_ORG"]).default("OWN_ORG"),
});

const UpdateSchema = CreateSchema.partial();

// Catalogue of assignable permissions, grouped by module. The UI renders these
// as checkboxes so admins can define roles to their requirement. "*" (super
// admin / full access) is offered separately by the UI.
const PERMISSION_CATALOGUE: { module: string; permissions: string[] }[] = [
  { module: "Organization", permissions: ["organization:read", "organization:create"] },
  { module: "Users", permissions: ["user:read", "user:manage"] },
  { module: "Roles", permissions: ["role:read", "role:manage"] },
  { module: "Projects", permissions: ["project:read", "project:create", "project:update", "project:member:manage"] },
  { module: "Documents", permissions: ["document:read", "document:create", "document:update"] },
  { module: "Drawings", permissions: ["drawing:read", "drawing:create", "drawing:update"] },
  { module: "Workflow", permissions: ["workflow:read", "workflow:manage", "workflow:action"] },
  { module: "RFI", permissions: ["rfi:read", "rfi:create", "rfi:update"] },
  { module: "Submittals", permissions: ["submittal:read", "submittal:create", "submittal:update"] },
  { module: "Transmittals", permissions: ["transmittal:read", "transmittal:create", "transmittal:update"] },
  { module: "Meetings", permissions: ["meeting:read", "meeting:create", "meeting:update"] },
  { module: "Snagging", permissions: ["snag:read", "snag:create", "snag:update"] },
  { module: "NCR", permissions: ["ncr:read", "ncr:create", "ncr:update"] },
  { module: "Inspections", permissions: ["inspection:read", "inspection:create", "inspection:update"] },
  { module: "Quality (Checklists)", permissions: ["quality:read", "quality:create", "quality:update"] },
  { module: "HSE Incidents", permissions: ["hse:read", "hse:create", "hse:update"] },
  { module: "Permits", permissions: ["permit:read", "permit:create", "permit:update"] },
  { module: "Assets", permissions: ["asset:read", "asset:create", "asset:update"] },
  { module: "Forms", permissions: ["form:read", "form:create", "form:update"] },
  { module: "Tasks", permissions: ["task:read", "task:create", "task:update"] },
  { module: "Audit", permissions: ["audit:read"] },
];

export async function roleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /roles/permissions — catalogue for the role editor
  app.get("/roles/permissions", { preHandler: requirePermission("role:read") }, async () => {
    return { groups: PERMISSION_CATALOGUE, wildcard: "*" };
  });

  app.get("/roles", { preHandler: requirePermission("role:read") }, async (req) => {
    const { tenantId } = ctx(req);
    const items = await prisma.role.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
    return { items, total: items.length };
  });

  app.post("/roles", { preHandler: requirePermission("role:manage") }, async (req, reply) => {
    const { tenantId, userId } = ctx(req);
    const body = parse(CreateSchema, req.body);
    const role = await prisma.role
      .create({ data: { tenantId, ...body } })
      .catch(() => {
        throw ApiError.conflict("A role with that name already exists");
      });
    await audit({
      tenantId,
      userId,
      action: "role.created",
      resourceType: "role",
      resourceId: role.id,
      changes: body,
      ip: req.ip,
    });
    return reply.code(201).send(role);
  });

  app.patch("/roles/:id", { preHandler: requirePermission("role:manage") }, async (req) => {
    const { tenantId, userId } = ctx(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.role.findFirst({ where: { id, tenantId } });
    if (!existing) throw ApiError.notFound();
    if (existing.isSystem) throw ApiError.unprocessable("System roles cannot be modified");
    const body = parse(UpdateSchema, req.body);
    const role = await prisma.role.update({ where: { id }, data: body });
    await audit({
      tenantId,
      userId,
      action: "role.updated",
      resourceType: "role",
      resourceId: id,
      changes: body,
      ip: req.ip,
    });
    return role;
  });

  app.delete(
    "/roles/:id",
    { preHandler: requirePermission("role:manage") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { id } = req.params as { id: string };
      const existing = await prisma.role.findFirst({ where: { id, tenantId } });
      if (!existing) throw ApiError.notFound();
      if (existing.isSystem) throw ApiError.unprocessable("System roles cannot be deleted");
      await prisma.role.delete({ where: { id } });
      await audit({
        tenantId,
        userId,
        action: "role.deleted",
        resourceType: "role",
        resourceId: id,
        ip: req.ip,
      });
      return reply.code(204).send();
    },
  );
}
