import { prisma } from "@cde/db";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from "../../lib/jwt.js";
import { env } from "../../config/env.js";
import { ApiError } from "../../lib/errors.js";
import { audit } from "../../lib/audit.js";

// System role catalogue provisioned for every new tenant (Phase 1 subset).
const SYSTEM_ROLES = [
  { name: "Tenant Admin", permissions: ["*"] },
  {
    name: "Project Manager",
    permissions: [
      "project:read",
      "project:create",
      "project:update",
      "project:member:manage",
      "organization:read",
      "organization:create",
      "role:read",
    ],
  },
  { name: "Member", permissions: ["project:read", "organization:read"] },
];

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

async function issueTokens(
  user: { id: string; tenantId: string; email: string },
  meta: RequestMeta,
): Promise<TokenPair> {
  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
  });
  const { token: refreshToken, jti } = signRefreshToken({
    sub: user.id,
    tenantId: user.tenantId,
  });

  await prisma.session.create({
    data: {
      id: jti,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL * 1000),
    },
  });

  return { accessToken, refreshToken, tokenType: "Bearer", expiresIn: env.JWT_ACCESS_TTL };
}

// Self-service onboarding: create a tenant, its system roles, a default
// organisation, and the first admin user — all atomically.
export async function registerTenant(input: {
  tenantName: string;
  email: string;
  password: string;
  displayName: string;
  meta: RequestMeta;
}): Promise<TokenPair> {
  const email = input.email.toLowerCase();

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: input.tenantName },
    });

    const roleIds: Record<string, string> = {};
    for (const r of SYSTEM_ROLES) {
      const role = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: r.name,
          isSystem: true,
          permissions: r.permissions,
        },
      });
      roleIds[r.name] = role.id;
    }

    const org = await tx.organization.create({
      data: { tenantId: tenant.id, name: input.tenantName, type: "CONTRACTOR" },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        displayName: input.displayName,
        passwordHash: hashPassword(input.password),
        status: "ACTIVE",
      },
    });

    await tx.userOrgMembership.create({
      data: { userId: user.id, organizationId: org.id, roleId: roleIds["Tenant Admin"]! },
    });

    return { tenant, user };
  });

  await audit({
    tenantId: result.tenant.id,
    userId: result.user.id,
    action: "tenant.registered",
    resourceType: "tenant",
    resourceId: result.tenant.id,
    ip: input.meta.ip,
  });

  return issueTokens(result.user, input.meta);
}

export async function login(input: {
  email: string;
  password: string;
  tenantDomain?: string;
  meta: RequestMeta;
}): Promise<TokenPair> {
  const email = input.email.toLowerCase();

  const user = await prisma.user.findFirst({
    where: {
      email,
      ...(input.tenantDomain ? { tenant: { domain: input.tenantDomain } } : {}),
    },
  });

  // Constant-ish failure path: do not reveal whether the email exists.
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (user.status !== "ACTIVE") {
    throw ApiError.forbidden("Account is not active");
  }

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: "auth.login",
    resourceType: "user",
    resourceId: user.id,
    ip: input.meta.ip,
  });

  return issueTokens(user, input.meta);
}

// Refresh-token rotation: the presented token must match a live session; on use
// we revoke the old session and mint a new one.
export async function refresh(input: {
  refreshToken: string;
  meta: RequestMeta;
}): Promise<TokenPair> {
  let claims;
  try {
    claims = verifyRefreshToken(input.refreshToken);
  } catch {
    throw ApiError.unauthorized("Refresh token is invalid or expired");
  }

  const session = await prisma.session.findUnique({ where: { id: claims.jti } });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt < new Date() ||
    session.refreshTokenHash !== hashToken(input.refreshToken)
  ) {
    throw ApiError.unauthorized("Session is no longer valid");
  }

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.status !== "ACTIVE") {
    throw ApiError.unauthorized("User is not active");
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(user, input.meta);
}

export async function logout(refreshToken: string): Promise<void> {
  try {
    const claims = verifyRefreshToken(refreshToken);
    await prisma.session.updateMany({
      where: { id: claims.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Idempotent: an invalid/expired token is already "logged out".
  }
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      tenant: { select: { id: true, name: true, domain: true } },
      memberships: {
        include: {
          organization: { select: { id: true, name: true, type: true } },
          role: { select: { id: true, name: true, permissions: true } },
        },
      },
    },
  });
  if (!user) throw ApiError.notFound("User not found");

  const permissions = new Set<string>();
  for (const m of user.memberships) {
    for (const p of (m.role.permissions as string[]) ?? []) permissions.add(String(p));
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    tenant: user.tenant,
    memberships: user.memberships.map((m) => ({
      organization: m.organization,
      role: { id: m.role.id, name: m.role.name },
    })),
    permissions: [...permissions],
  };
}
