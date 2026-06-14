# Identity & Auth Module

**Spec:** §2 Identity, §3.2 · **Status:** ✅ running (password auth) · 🟡 MFA/SSO planned
**Code:** `apps/api/src/modules/identity/`, `src/middleware/authenticate.ts`, `src/lib/jwt.ts`, `src/lib/password.ts`

## Purpose
Authentication, session management, and the per-request auth/tenant context that every other module depends on. Self-service tenant onboarding included.

## Endpoints
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/v1/auth/register` | public | Create tenant + system roles + default org + admin user (atomic); returns tokens |
| POST | `/v1/auth/token` | public | Password grant (login) → access + refresh tokens |
| POST | `/v1/auth/login` | public | Alias of `/auth/token` |
| POST | `/v1/auth/token/refresh` | public | Rotate refresh token → new token pair |
| POST | `/v1/auth/logout` | public | Revoke the session for a refresh token |
| GET | `/v1/auth/me` | bearer | Current user profile, tenant, memberships, effective permissions |

## Data model
- `users` — `id, tenant_id, email, display_name, password_hash, status, mfa_enabled` (unique `[tenant_id, email]`)
- `sessions` — `id, user_id, refresh_token_hash, ip, user_agent, expires_at, revoked_at`

## Lifecycle & business rules
- **Access token:** JWT, 15-min TTL, claims `{sub, tenantId, email}`, issuer `cde-platform`.
- **Refresh token:** random JWT, stored **only as SHA-256 hash**; **rotated on every use** — reusing a consumed token fails (old session revoked). 30-day TTL.
- **Login** verifies scrypt hash in constant-ish time; identical error for unknown email vs wrong password (no enumeration). Non-`ACTIVE` users are refused.
- **Permissions** are resolved per request by aggregating role permissions across the user's org memberships.

## Permissions
Public endpoints; `/auth/me` requires a valid bearer token. No specific RBAC permission.

## Pending / next
- TOTP **MFA** (`/auth/mfa/verify`) — `mfa_enabled` flag exists.
- **SSO** (SAML / Entra ID / OIDC) behind the same `/auth/*` surface (`sso_configurations` table planned).
- Swap scrypt → **argon2id**; cache permission sets in Redis; PKCE for SPA/mobile.
