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
});

const UpdateSchema = CreateSchema.partial();

export async function roleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

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
