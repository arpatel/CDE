import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@cde/db";
import { parse } from "../../lib/validation.js";
import { ApiError } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";
import { authenticate, ctx, requirePermission } from "../../middleware/authenticate.js";

const CreateSchema = z.object({
  name: z.string().min(2).max(160),
  code: z.string().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, "code: alphanumeric/._- only"),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  ownerOrgId: z.string().uuid().optional(),
});

const UpdateSchema = CreateSchema.partial().omit({ code: true });

const AddMemberSchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
});

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /projects
  app.get("/projects", { preHandler: requirePermission("project:read") }, async (req) => {
    const { tenantId } = ctx(req);
    const items = await prisma.project.findMany({
      where: { tenantId, isDeleted: false },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true } },
        ownerOrg: { select: { id: true, name: true, type: true } },
      },
    });
    return { items, total: items.length };
  });

  // POST /projects
  app.post("/projects", { preHandler: requirePermission("project:create") }, async (req, reply) => {
    const { tenantId, userId } = ctx(req);
    const body = parse(CreateSchema, req.body);

    // A project must map to an organisation that belongs to this tenant.
    if (body.ownerOrgId) {
      const org = await prisma.organization.findFirst({
        where: { id: body.ownerOrgId, tenantId, isDeleted: false },
      });
      if (!org) throw ApiError.unprocessable("Owner organisation does not belong to this tenant");
    }

    const project = await prisma
      .$transaction(async (tx) => {
        const created = await tx.project.create({
          data: { tenantId, createdBy: userId, ...body },
        });
        // Creator is added as the first project member.
        await tx.projectMember.create({
          data: { projectId: created.id, userId, acceptedAt: new Date(), invitedBy: userId },
        });
        return created;
      })
      .catch((e: { code?: string }) => {
        if (e.code === "P2002") throw ApiError.conflict("A project with that code already exists");
        throw e;
      });

    await audit({
      tenantId,
      userId,
      action: "project.created",
      resourceType: "project",
      resourceId: project.id,
      changes: body,
      ip: req.ip,
    });
    return reply.code(201).send(project);
  });

  // GET /projects/:id
  app.get("/projects/:id", { preHandler: requirePermission("project:read") }, async (req) => {
    const { tenantId } = ctx(req);
    const { id } = req.params as { id: string };
    const project = await prisma.project.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: { ownerOrg: { select: { id: true, name: true } } },
    });
    if (!project) throw ApiError.notFound();
    return project;
  });

  // PATCH /projects/:id
  app.patch("/projects/:id", { preHandler: requirePermission("project:update") }, async (req) => {
    const { tenantId, userId } = ctx(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.project.findFirst({ where: { id, tenantId, isDeleted: false } });
    if (!existing) throw ApiError.notFound();
    const body = parse(UpdateSchema, req.body);
    if (body.ownerOrgId) {
      const org = await prisma.organization.findFirst({
        where: { id: body.ownerOrgId, tenantId, isDeleted: false },
      });
      if (!org) throw ApiError.unprocessable("Owner organisation does not belong to this tenant");
    }
    const project = await prisma.project.update({
      where: { id },
      data: { ...body, version: { increment: 1 } },
    });
    await audit({
      tenantId,
      userId,
      action: "project.updated",
      resourceType: "project",
      resourceId: id,
      changes: body,
      ip: req.ip,
    });
    return project;
  });

  // DELETE /projects/:id (archive / soft delete)
  app.delete(
    "/projects/:id",
    { preHandler: requirePermission("project:update") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { id } = req.params as { id: string };
      const existing = await prisma.project.findFirst({
        where: { id, tenantId, isDeleted: false },
      });
      if (!existing) throw ApiError.notFound();
      await prisma.project.update({
        where: { id },
        data: { isDeleted: true, status: "ARCHIVED" },
      });
      await audit({
        tenantId,
        userId,
        action: "project.archived",
        resourceType: "project",
        resourceId: id,
        ip: req.ip,
      });
      return reply.code(204).send();
    },
  );

  // GET /projects/:id/members
  app.get(
    "/projects/:id/members",
    { preHandler: requirePermission("project:read") },
    async (req) => {
      const { tenantId } = ctx(req);
      const { id } = req.params as { id: string };
      await assertProject(tenantId, id);
      const members = await prisma.projectMember.findMany({
        where: { projectId: id },
        include: {
          user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
          role: { select: { id: true, name: true } },
        },
      });
      return { items: members, total: members.length };
    },
  );

  // POST /projects/:id/members
  app.post(
    "/projects/:id/members",
    { preHandler: requirePermission("project:member:manage") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { id } = req.params as { id: string };
      await assertProject(tenantId, id);
      const body = parse(AddMemberSchema, req.body);

      // Ensure the target user belongs to the same tenant.
      const target = await prisma.user.findFirst({ where: { id: body.userId, tenantId } });
      if (!target) throw ApiError.unprocessable("User does not belong to this tenant");
      // Validate the project role belongs to the tenant.
      if (body.roleId) {
        const role = await prisma.role.findFirst({ where: { id: body.roleId, tenantId } });
        if (!role) throw ApiError.unprocessable("Role does not belong to this tenant");
      }

      const member = await prisma.projectMember
        .create({ data: { projectId: id, invitedBy: userId, acceptedAt: new Date(), ...body } })
        .catch((e: { code?: string }) => {
          if (e.code === "P2002") throw ApiError.conflict("User is already a project member");
          throw e;
        });
      await audit({
        tenantId,
        userId,
        action: "project.member.added",
        resourceType: "project",
        resourceId: id,
        changes: { userId: body.userId, roleId: body.roleId },
        ip: req.ip,
      });
      return reply.code(201).send(member);
    },
  );

  // POST /projects/:id/members/bulk — assign many users (or change their role) at once
  app.post(
    "/projects/:id/members/bulk",
    { preHandler: requirePermission("project:member:manage") },
    async (req) => {
      const { tenantId, userId } = ctx(req);
      const { id } = req.params as { id: string };
      await assertProject(tenantId, id);
      const body = parse(
        z.object({ userIds: z.array(z.string().uuid()).min(1), roleId: z.string().uuid() }),
        req.body,
      );
      const role = await prisma.role.findFirst({ where: { id: body.roleId, tenantId } });
      if (!role) throw ApiError.unprocessable("Role does not belong to this tenant");
      const valid = await prisma.user.findMany({
        where: { id: { in: body.userIds }, tenantId },
        select: { id: true },
      });
      const validIds = new Set(valid.map((u) => u.id));

      let updated = 0;
      for (const uid of body.userIds) {
        if (!validIds.has(uid)) continue;
        await prisma.projectMember.upsert({
          where: { projectId_userId: { projectId: id, userId: uid } },
          update: { roleId: body.roleId },
          create: { projectId: id, userId: uid, roleId: body.roleId, invitedBy: userId, acceptedAt: new Date() },
        });
        updated++;
      }
      await audit({
        tenantId,
        userId,
        action: "project.member.bulk_assigned",
        resourceType: "project",
        resourceId: id,
        changes: { userIds: body.userIds, roleId: body.roleId },
        ip: req.ip,
      });
      return { updated };
    },
  );

  // POST /projects/:id/members/bulk-remove — remove many members at once
  app.post(
    "/projects/:id/members/bulk-remove",
    { preHandler: requirePermission("project:member:manage") },
    async (req) => {
      const { tenantId, userId } = ctx(req);
      const { id } = req.params as { id: string };
      await assertProject(tenantId, id);
      const body = parse(z.object({ userIds: z.array(z.string().uuid()).min(1) }), req.body);
      const result = await prisma.projectMember.deleteMany({
        where: { projectId: id, userId: { in: body.userIds } },
      });
      await audit({
        tenantId,
        userId,
        action: "project.member.bulk_removed",
        resourceType: "project",
        resourceId: id,
        changes: { userIds: body.userIds },
        ip: req.ip,
      });
      return { removed: result.count };
    },
  );

  // PATCH /projects/:id/members/:memberUserId — change a member's project role
  app.patch(
    "/projects/:id/members/:memberUserId",
    { preHandler: requirePermission("project:member:manage") },
    async (req) => {
      const { tenantId, userId } = ctx(req);
      const { id, memberUserId } = req.params as { id: string; memberUserId: string };
      await assertProject(tenantId, id);
      const body = parse(z.object({ roleId: z.string().uuid() }), req.body);
      const role = await prisma.role.findFirst({ where: { id: body.roleId, tenantId } });
      if (!role) throw ApiError.unprocessable("Role does not belong to this tenant");
      const existing = await prisma.projectMember.findFirst({
        where: { projectId: id, userId: memberUserId },
      });
      if (!existing) throw ApiError.notFound("Member not found");
      const member = await prisma.projectMember.update({
        where: { id: existing.id },
        data: { roleId: body.roleId },
      });
      await audit({
        tenantId,
        userId,
        action: "project.member.role_changed",
        resourceType: "project",
        resourceId: id,
        changes: { userId: memberUserId, roleId: body.roleId },
        ip: req.ip,
      });
      return member;
    },
  );

  // DELETE /projects/:id/members/:memberUserId — remove a member
  app.delete(
    "/projects/:id/members/:memberUserId",
    { preHandler: requirePermission("project:member:manage") },
    async (req, reply) => {
      const { tenantId, userId } = ctx(req);
      const { id, memberUserId } = req.params as { id: string; memberUserId: string };
      await assertProject(tenantId, id);
      const existing = await prisma.projectMember.findFirst({
        where: { projectId: id, userId: memberUserId },
      });
      if (!existing) throw ApiError.notFound("Member not found");
      await prisma.projectMember.delete({ where: { id: existing.id } });
      await audit({
        tenantId,
        userId,
        action: "project.member.removed",
        resourceType: "project",
        resourceId: id,
        changes: { userId: memberUserId },
        ip: req.ip,
      });
      return reply.code(204).send();
    },
  );

  // GET /projects/:id/dashboard — summary counters (extended as modules land)
  app.get(
    "/projects/:id/dashboard",
    { preHandler: requirePermission("project:read") },
    async (req) => {
      const { tenantId } = ctx(req);
      const { id } = req.params as { id: string };
      const project = await assertProject(tenantId, id);
      const memberCount = await prisma.projectMember.count({ where: { projectId: id } });
      return {
        project: { id: project.id, name: project.name, code: project.code, status: project.status },
        counters: {
          members: memberCount,
          // Document/RFI/snag/workflow counters wired as those modules come online.
          documents: 0,
          openRfis: 0,
          openSnags: 0,
          pendingApprovals: 0,
        },
      };
    },
  );
}

async function assertProject(tenantId: string, id: string) {
  const project = await prisma.project.findFirst({ where: { id, tenantId, isDeleted: false } });
  if (!project) throw ApiError.notFound();
  return project;
}
