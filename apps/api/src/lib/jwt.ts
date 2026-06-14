import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Access-token claims carried on every authenticated request.
export interface AccessClaims {
  sub: string; // userId
  tenantId: string;
  email: string;
}

export interface RefreshClaims {
  sub: string;
  tenantId: string;
  jti: string; // session id
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: "cde-platform",
  });
}

export function signRefreshToken(claims: Omit<RefreshClaims, "jti">): {
  token: string;
  jti: string;
} {
  const jti = randomUUID();
  const token = jwt.sign({ ...claims, jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
    issuer: "cde-platform",
  });
  return { token, jti };
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "cde-platform",
  }) as AccessClaims;
}

export function verifyRefreshToken(token: string): RefreshClaims {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: "cde-platform",
  }) as RefreshClaims;
}

// Refresh tokens are stored hashed (never in plaintext) so a DB leak cannot
// reconstruct a usable token.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
