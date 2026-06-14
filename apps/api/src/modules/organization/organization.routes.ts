import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@cde/db";
import { parse } from "../../lib/validation.js";
import { ApiError } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";
import { authenticate, ctx, requirePermission } from "../../middleware/authenticate.js";

const OrgType = z.enum([
  "CLIENT",
  "CONSULTANT",
  "CONTRACTOR",
  "SUBCONTRACTOR",
  "SUPPLIER",
  "OTHER",
]);

const CreateSchema = z.object({
  name: z.string().min(2).max(160),
  type: OrgType.default("OTHER"),
  country: z.string().max(2).optional(),
  parentId: z.string().uuid().optional(),
});

const UpdateSchema = CreateSchema.partial();

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /organizations
  app.get("/organizations", async (req) => {
    const { tenantId } = ctx(req);
    const items = await prisma.organization.findMany({
      where: { tenantId, isDeleted: false },
      orderBy: { name: "asc" },
    });
    return { items, total: items.length };
  });

  // POST /organizations
  app.post(
    "/organizations",
    { preHandler: requirePermission("organization:create") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const body = parse(CreateSchema, req.body);
      const org = await prisma.organization.create({
        data: { ...body, tenantId, createdBy: userId },
      });
      await audit({
        tenantId,
        userId,
        action: "organization.created",
        resourceType: "organization",
        resourceId: org.id,
        changes: body,
        ip: req.ip,
      });
      return reply.code(201).send(org);
    },
  );

  // GET /organizations/:id
  app.get("/organizations/:id", async (req) => {
    const { tenantId } = ctx(req);
    const { id } = req.params as { id: string };
    const org = await prisma.organization.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!org) throw ApiError.notFound();
    return org;
  });

  // PATCH /organizations/:id
  app.patch(
    "/organizations/:id",
    { preHandler: requirePermission("organization:create") },
    async (req) => {
      const { tenantId, userId } = ctx(req);
      const { id } = req.params as { id: string };
      const body = parse(UpdateSchema, req.body);
      const existing = await prisma.organization.findFirst({
        where: { id, tenantId, isDeleted: false },
      });
      if (!existing) throw ApiError.notFound();
      const org = await prisma.organization.update({
        where: { id },
        data: { ...body, version: { increment: 1 } },
      });
      await audit({
        tenantId,
        userId,
        action: "organization.updated",
        resourceType: "organization",
        resourceId: id,
        changes: body,
        ip: req.ip,
      });
      return org;
    },
  );

  // DELETE /organizations/:id (soft delete)
  app.delete(
    "/organizations/:id",
    { preHandler: requirePermission("organization:create") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { id } = req.params as { id: string };
      const existing = await prisma.organization.findFirst({
        where: { id, tenantId, isDeleted: false },
      });
      if (!existing) throw ApiError.notFound();
      await prisma.organization.update({ where: { id }, data: { isDeleted: true } });
      await audit({
        tenantId,
        userId,
        action: "organization.deleted",
        resourceType: "organization",
        resourceId: id,
        ip: req.ip,
      });
      return reply.code(204).send();
    },
  );
}
