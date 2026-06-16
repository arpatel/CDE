# CLAUDE.md

Guidance for Claude Code (and humans) working in this repo.

## What this is

Enterprise **Common Data Environment (CDE)** for construction collaboration — a buildable implementation of the spec in `docs/` (compressed from the original `.docx` requirement, technical spec, and roadmap). Comparable in ambition to Asite / Oracle Aconex / Procore.

**Architecture: modular monolith.** One Node/TS API (`apps/api`) with hard module boundaries, one Next.js web app (`apps/web`), shared Prisma DB package (`packages/db`). Each module maps 1:1 to a future microservice; we extract only when load/team-scale demands it. Rationale + decisions in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repo layout

```
apps/api      Fastify backend (modular monolith)
  src/config    env validation (zod)
  src/lib       errors (RFC7807), jwt, password, audit, validation, crud factory
  src/middleware authenticate + RBAC permission guard
  src/modules   identity, organization, role, project, domain/*
apps/web      Next.js 14 (App Router) — UI ported from CDE_UI_Prototype.html
  lib/          api client (token+refresh), store (auth/project context)
  components/   Shell, Modal, ResourceList
  app/          one route per module
packages/db   Prisma schema, migrations, seed, shared client
docs/         compressed SPEC / ROADMAP / ARCHITECTURE + docs/modules/*
```

## Commands

| Command | Action |
|---|---|
| `pnpm install` | Install (pnpm workspace; `allowBuilds` in `pnpm-workspace.yaml` permits Prisma/esbuild scripts) |
| `pnpm db:up` / `db:down` | Start / stop Postgres 16 + Redis 7 (Docker Compose) |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:seed` | Seed demo tenant (`admin@demo.cde.local` / `Password123!`) |
| `pnpm dev` | API only (`:4000`) |
| `pnpm dev:web` | Web only (`:3000`) |
| `pnpm dev:all` | API + web in parallel |
| `pnpm db:studio` | Prisma Studio |
| `pnpm typecheck` | Typecheck all packages |

## Conventions (follow these when adding code)

- **Errors:** throw `ApiError` (`src/lib/errors.ts`) → emitted as RFC 7807 `application/problem+json` `{type,title,status,code,detail,instance}`. Never `reply.send` an ad-hoc error shape.
- **Validation:** Zod at the edge via `parse(schema, req.body)` → 400 `VALIDATION_ERROR`.
- **Tenancy:** every tenant-scoped query MUST filter by `tenantId` from `ctx(req)`. Never trust a tenantId from the body/params.
- **RBAC:** guard mutations with `requirePermission("<module>:<action>")`. `"*"` = superuser (Tenant Admin).
- **Audit:** every create/update/delete calls `audit({...})` (append-only `audit_logs`).
- **Soft delete + optimistic lock:** primary entities have `isDeleted` + `version`; deletes are soft, updates bump `version`.
- **Generic CRUD:** project-scoped resources are registered through `registerCrud()` (`src/lib/crud.ts`) + a `CrudConfig` in `src/modules/domain/schemas.ts`. Add a new simple module by adding one entry there.

## How to add a new domain module

1. Add the Prisma model(s) to `packages/db/prisma/schema.prisma` (scalar `tenantId`/`projectId` columns, intra-module relations only — cross-module refs are scalar IDs, no FKs, per spec).
2. `pnpm db:migrate`.
3. Add a Zod create schema + `def({...})` entry to `src/modules/domain/schemas.ts`.
4. For lifecycle actions beyond CRUD, add a `register<X>Lifecycle(app)` in `src/modules/domain/domain.routes.ts`.
5. (Web) add a route under `apps/web/app/<module>/page.tsx` using `ResourceList` (simple) or a custom page (lifecycle).
6. Document it in `docs/modules/<module>.md`.

## Database

Runs on the developer's **local PostgreSQL 18**, port **5433**, database **`CDE`**, role **`cde`** (owner of the DB). `DATABASE_URL` in `.env` → `postgresql://cde:cde_dev_password@127.0.0.1:5433/CDE?schema=public`. Apply schema with `prisma migrate deploy`, then `pnpm db:seed`. Docker Compose (`pnpm db:up`) remains as an optional fallback DB on 5432 — not required.

**After every `prisma db push`** run `pnpm --filter @cde/db run ensure-indexes`. It (re)creates DB-level guarantees Prisma's schema DSL can't express — currently the partial unique index `uq_document_docref_per_folder` enforcing **Doc Ref unique per folder** (root `folder_id` NULL coalesced to a sentinel; soft-deleted / auto-numbered rows excluded). `db push` only manages schema-declared indexes and may drop it.

## Environment / gotchas (Windows + this toolchain)

- API loads env via `--env-file=../../.env` (see `apps/api` scripts); `src/config/env.ts` reads `process.env` and validates. Changing `.env` requires a full API restart (env is read at process start, not on hot-reload).
- The DB name `CDE` is **case-sensitive** (created quoted); the connection URL must use `/CDE`, not `/cde`.
- Provisioning the local DB needed the `cde` role to **own** the `CDE` database (`ALTER DATABASE "CDE" OWNER TO cde;`) so Prisma can create tables in the `public` schema.
- Prisma CLI run from `packages/db` needs `DATABASE_URL` in scope — set it inline if a command can't find it.
- pnpm blocks build scripts by default; approved ones are listed under `allowBuilds` in `pnpm-workspace.yaml`.
- Fastify rejects body-less POSTs without `Content-Type`; a catch-all content-type parser in `app.ts` tolerates them (needed for action endpoints like `/close`, `/approve`).
- In PowerShell test scripts, `$pid` is reserved — use another name.

## Module docs

Per-module specs (purpose, endpoints, data model, lifecycle, permissions, status) live in [docs/modules/](docs/modules/). Index: [docs/modules/README.md](docs/modules/README.md).

## Status

Live build status, what's running, and what's pending: [STATUS.md](STATUS.md).
