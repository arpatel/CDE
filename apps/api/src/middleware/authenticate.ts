import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@cde/db";
import { verifyAccessToken } from "../lib/jwt.js";
import { ApiError } from "../lib/errors.js";

export type DataScope = "OWN" | "OWN_ORG" | "ALL_ORG";

export interface AuthContext {
  userId: string;
  tenantId: string;
  email: string;
  permissions: Set<string>;
  // Most permissive data-visibility level across the user's roles.
  dataScope: DataScope;
  // Organisations the user belongs to (used for OWN_ORG scoping).
  organizationIds: string[];
}

// Rank so we can take the most permissive scope across a user's roles.
const SCOPE_RANK: Record<DataScope, number> = { OWN: 0, OWN_ORG: 1, ALL_ORG: 2 };

// Resolves permissions, data scope and org membership for a user by aggregating
// the roles of all their organisation memberships. "*" = superuser ⇒ ALL_ORG.
async function loadAccess(userId: string): Promise<{
  permissions: Set<string>;
  dataScope: DataScope;
  organizationIds: string[];
}> {
  const memberships = await prisma.userOrgMembership.findMany({
    where: { userId },
    include: { role: true },
  });
  const permissions = new Set<string>();
  const organizationIds: string[] = [];
  let dataScope: DataScope = "OWN";
  for (const m of memberships) {
    organizationIds.push(m.organizationId);
    const perms = Array.isArray(m.role.permissions) ? m.role.permissions : [];
    for (const p of perms) permissions.add(String(p));
    const roleScope = ((m.role as { dataScope?: string }).dataScope ?? "OWN_ORG") as DataScope;
    if (SCOPE_RANK[roleScope] > SCOPE_RANK[dataScope]) dataScope = roleScope;
  }
  if (permissions.has("*")) dataScope = "ALL_ORG";
  return { permissions, dataScope, organizationIds };
}

// preHandler: verifies the bearer token and attaches the auth context (incl.
// tenant) to the request. Every tenant-scoped route depends on this.
export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw ApiError.unauthorized();
  }
  const token = header.slice("Bearer ".length).trim();
  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized("Token is invalid or expired");
  }
  const { permissions, dataScope, organizationIds } = await loadAccess(claims.sub);
  req.auth = {
    userId: claims.sub,
    tenantId: claims.tenantId,
    email: claims.email,
    permissions,
    dataScope,
    organizationIds,
  };
}

// Permissions a user gains from the role(s) they hold IN a specific project.
// Functional roles live at the project level, so capabilities can be granted
// per project on top of the org-level access tier.
async function projectRolePermissions(userId: string, projectId: string): Promise<Set<string>> {
  const members = await prisma.projectMember.findMany({
    where: { projectId, userId, roleId: { not: null } },
    include: { role: { select: { permissions: true } } },
  });
  const perms = new Set<string>();
  for (const m of members) {
    const list = Array.isArray(m.role?.permissions) ? (m.role!.permissions as string[]) : [];
    for (const p of list) perms.add(String(p));
  }
  return perms;
}

// preHandler factory: enforces that the caller holds every required permission.
// Effective permissions = org access tier ∪ (project roles, on project routes).
export function requirePermission(...required: string[]) {
  return async function permissionGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const perms = req.auth?.permissions;
    if (!perms) throw ApiError.unauthorized();
    if (perms.has("*")) return;
    if (required.every((r) => perms.has(r))) return;

    // On project-scoped routes, top up with the caller's project-role permissions.
    const projectId = (req.params as { projectId?: string } | undefined)?.projectId;
    if (projectId && req.auth) {
      const extra = await projectRolePermissions(req.auth.userId, projectId);
      if (required.every((r) => perms.has(r) || extra.has(r))) return;
    }
    const missing = required.find((r) => !perms.has(r));
    throw ApiError.forbidden(`Missing required permission: ${missing}`);
  };
}

// preHandler: only a super admin (Tenant Admin, holder of the "*" permission)
// may pass. Used for tenant-wide governance actions like creating organizations.
export async function requireSuperAdmin(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const perms = req.auth?.permissions;
  if (!perms) throw ApiError.unauthorized();
  if (!perms.has("*")) throw ApiError.forbidden("Only a super admin can perform this action");
}

// Convenience accessor that asserts the request is authenticated.
export function ctx(req: FastifyRequest): AuthContext {
  if (!req.auth) throw ApiError.unauthorized();
  return req.auth;
}
