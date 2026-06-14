# CDE Platform — Architecture (as built)

How this repository realises the spec. Decisions made as a principal architect optimising for **time-to-running-software now** and **clean extraction to microservices later**.

## Decision 1 — Modular monolith, not microservices (yet)

The spec targets 23 Kubernetes microservices. We start as **one deployable** (`apps/api`) with **hard module boundaries** under `src/modules/*`. Each module owns its routes, services, and (logically) its tables.

**Why:** at 0→10k users a distributed system adds latency, ops cost, and failure modes with zero product value. We keep DDD seams so any module can be lifted into its own service when a real scaling or team-ownership signal appears (the spec's per-service DB ownership maps to our per-module table groups). **Trade-off:** shared process & DB now; mitigated by module isolation + `tenant_id` discipline + an event seam we can later back with SQS/SNS.

## Decision 2 — Multi-tenancy via shared schema + `tenant_id`

Every tenant-scoped row carries `tenant_id`; the auth layer pins tenant from the JWT and all queries filter by it. **Postgres Row-Level Security** is the next hardening step (defence-in-depth so a missed `where` can't leak data). Schema-per-tenant is reserved for large/regulated tenants — a routing concern we can add without remodelling.

## Decision 3 — Stateless JWT auth + rotating refresh sessions

Short-lived access tokens (15 min) carry `{sub, tenantId, email}`. Refresh tokens are random, **stored only as SHA-256 hashes** in `sessions`, and **rotated on every use** (reuse ⇒ session invalid). Maps to spec OAuth2/OIDC; Auth0/Keycloak/Entra SSO slot in behind the same `/auth/*` surface later. Permissions are resolved per request from role memberships (cache in Redis when hot).

## Layout

```
cde-platform/
├─ apps/
│  ├─ api/                  # Fastify modular monolith (Node 20 + TS)
│  │  └─ src/
│  │     ├─ config/         # env validation (zod)
│  │     ├─ lib/            # errors (RFC7807), jwt, password, audit, validation
│  │     ├─ middleware/     # authenticate + RBAC permission guard
│  │     └─ modules/        # health, identity, organization, role, project, …
│  └─ web/                  # Next.js app (Phase 2 — prototype port)
├─ packages/
│  └─ db/                   # Prisma schema, client, migrations, seed
├─ docs/                    # compressed SPEC / ROADMAP / ARCHITECTURE
└─ docker-compose.yml       # Postgres 16 + Redis 7
```

## Cross-cutting standards

- **Errors:** every failure is `ApiError` → RFC 7807 `application/problem+json` with `{type,title,status,code,detail,instance}`.
- **Validation:** Zod at the edge; invalid input ⇒ 400 `VALIDATION_ERROR`.
- **Audit:** every create/update/delete calls `audit()` → append-only `audit_logs` (spec §1.4/§4).
- **Soft delete + optimistic lock:** `is_deleted` + `version` on mutable entities.
- **Correlation:** `req.id` (UUID) on every request and 500 response.

## Module → spec mapping & status

| Module | Spec ref | Status |
|--------|----------|--------|
| identity (auth, JWT, refresh, RBAC) | §2 Identity, §3.2 | ✅ built |
| organization (tenant org tree) | §2 Organization | ✅ built |
| role (RBAC, system roles) | §1.4, §4 | ✅ built |
| project (CRUD, members, dashboard) | §2 Project, §3.3 | ✅ built |
| audit | §1.4 | ✅ built (lib) |
| document, drawing | §2.1–2.2 | ⏭ Phase 2 |
| workflow, rfi, submittal, transmittal, meeting | §2.3–2.7 | ⏭ Phase 2 |
| snagging, quality, hse, forms, task | §2.8–2.12 | ⏭ Phase 3 |
| bim, reporting, asset, integration | §2.11/2.13 | ⏭ Phase 4 |

See `../STATUS.md` for live build status and run instructions.
