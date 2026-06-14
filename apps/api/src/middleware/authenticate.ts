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

// preHandler factory: enforces that the caller holds every required permission.
export function requirePermission(...required: string[]) {
  return async function permissionGuard(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const perms = req.auth?.permissions;
    if (!perms) throw ApiError.unauthorized();
    if (perms.has("*")) return;
    for (const r of required) {
      if (!perms.has(r)) throw ApiError.forbidden(`Missing required permission: ${r}`);
    }
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
