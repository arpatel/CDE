import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@cde/db";
import { parse } from "../../lib/validation.js";
import { ApiError } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";
import { hashPassword } from "../../lib/password.js";
import { authenticate, ctx, requirePermission } from "../../middleware/authenticate.js";

// Admin user provisioning (spec §2 Identity / Admin Portal). The Tenant Admin
// creates organisations (organization module) and users (here), assigning each
// user to an organisation with a role.

const CreateUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(120),
  password: z.string().min(8).max(128),
  organizationId: z.string().uuid(),
  roleId: z.string().uuid(),
});

const UpdateUserSchema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  status: z.enum(["ACTIVE", "INVITED", "SUSPENDED", "DISABLED"]).optional(),
  password: z.string().min(8).max(128).optional(),
});

const MembershipSchema = z.object({
  organizationId: z.string().uuid(),
  roleId: z.string().uuid(),
});

function publicUser(u: {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  mfaEnabled: boolean;
  createdAt: Date;
  memberships?: any[];
}) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    status: u.status,
    mfaEnabled: u.mfaEnabled,
    createdAt: u.createdAt,
    memberships: (u.memberships ?? []).map((m) => ({
      organization: m.organization,
      role: m.role ? { id: m.role.id, name: m.role.name } : null,
    })),
  };
}

const membershipInclude = {
  memberships: {
    include: {
      organization: { select: { id: true, name: true, type: true } },
      role: { select: { id: true, name: true } },
    },
  },
} as const;

async function assertTenantOrgAndRole(tenantId: string, organizationId: string, roleId: string) {
  const org = await prisma.organization.findFirst({
    where: { id: organizationId, tenantId, isDeleted: false },
  });
  if (!org) throw ApiError.unprocessable("Organisation does not belong to this tenant");
  const role = await prisma.role.findFirst({ where: { id: roleId, tenantId } });
  if (!role) throw ApiError.unprocessable("Role does not belong to this tenant");
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET /users — list tenant users
  app.get("/users", { preHandler: requirePermission("user:read") }, async (req) => {
    const { tenantId } = ctx(req);
    const users = await prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: membershipInclude,
    });
    return { items: users.map(publicUser), total: users.length };
  });

  // POST /users — admin creates a user and assigns org + role
  app.post("/users", { preHandler: requirePermission("user:manage") }, async (req, reply) => {
    const { tenantId, userId } = ctx(req);
    const body = parse(CreateUserSchema, req.body);
    const email = body.email.toLowerCase();
    await assertTenantOrgAndRole(tenantId, body.organizationId, body.roleId);

    const existing = await prisma.user.findFirst({ where: { tenantId, email } });
    if (existing) throw ApiError.conflict("A user with that email already exists in this tenant");

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          email,
          displayName: body.displayName,
          passwordHash: hashPassword(body.password),
          status: "ACTIVE",
        },
      });
      await tx.userOrgMembership.create({
        data: { userId: user.id, organizationId: body.organizationId, roleId: body.roleId },
      });
      return tx.user.findUniqueOrThrow({ where: { id: user.id }, include: membershipInclude });
    });

    await audit({
      tenantId,
      userId,
      action: "user.created",
      resourceType: "user",
      resourceId: created.id,
      changes: { email, organizationId: body.organizationId, roleId: body.roleId },
      ip: req.ip,
    });
    return reply.code(201).send(publicUser(created));
  });

  // GET /users/:id
  app.get("/users/:id", { preHandler: requirePermission("user:read") }, async (req) => {
    const { tenantId } = ctx(req);
    const { id } = req.params as { id: string };
    const user = await prisma.user.findFirst({
      where: { id, tenantId },
      include: membershipInclude,
    });
    if (!user) throw ApiError.notFound();
    return publicUser(user);
  });

  // PATCH /users/:id — update profile / status / password
  app.patch("/users/:id", { preHandler: requirePermission("user:manage") }, async (req) => {
    const { tenantId, userId } = ctx(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!existing) throw ApiError.notFound();
    const body = parse(UpdateUserSchema, req.body);

    const data: Record<string, unknown> = {};
    if (body.displayName) data.displayName = body.displayName;
    if (body.status) data.status = body.status;
    if (body.password) data.passwordHash = hashPassword(body.password);

    const updated = await prisma.user.update({
      where: { id },
      data,
      include: membershipInclude,
    });
    await audit({
      tenantId,
      userId,
      action: "user.updated",
      resourceType: "user",
      resourceId: id,
      changes: { ...body, password: body.password ? "***" : undefined },
      ip: req.ip,
    });
    return publicUser(updated);
  });

  // POST /users/:id/memberships — (re)assign organisation + role
  app.post("/users/:id/memberships", { preHandler: requirePermission("user:manage") }, async (req, reply) => {
    const { tenantId, userId } = ctx(req);
    const { id } = req.params as { id: string };
    const target = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!target) throw ApiError.notFound();
    const body = parse(MembershipSchema, req.body);
    await assertTenantOrgAndRole(tenantId, body.organizationId, body.roleId);

    // Reassign: a user has one primary organisation + role. Replace any existing
    // membership so admin edits don't accumulate duplicates.
    const membership = await prisma.$transaction(async (tx) => {
      await tx.userOrgMembership.deleteMany({ where: { userId: id } });
      return tx.userOrgMembership.create({
        data: { userId: id, organizationId: body.organizationId, roleId: body.roleId },
      });
    });
    await audit({
      tenantId,
      userId,
      action: "user.membership.assigned",
      resourceType: "user",
      resourceId: id,
      changes: body,
      ip: req.ip,
    });
    return reply.code(201).send(membership);
  });

  // DELETE /users/:id — deactivate (never hard-delete a user record)
  app.delete("/users/:id", { preHandler: requirePermission("user:manage") }, async (req) => {
    const { tenantId, userId } = ctx(req);
    const { id } = req.params as { id: string };
    if (id === userId) throw ApiError.unprocessable("You cannot deactivate your own account");
    const existing = await prisma.user.findFirst({ where: { id, tenantId } });
    if (!existing) throw ApiError.notFound();
    const updated = await prisma.user.update({ where: { id }, data: { status: "DISABLED" } });
    await audit({
      tenantId,
      userId,
      action: "user.deactivated",
      resourceType: "user",
      resourceId: id,
      ip: req.ip,
    });
    return publicUser({ ...updated, memberships: [] });
  });
}
