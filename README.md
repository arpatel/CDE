# CDE Platform

Enterprise **Common Data Environment** for construction collaboration — a modular-monolith implementation of the spec in `docs/` (compressed from the original `.docx` requirement + spec + roadmap).

> Architecture rationale, module→spec mapping, and decisions: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. Live build status: **[STATUS.md](STATUS.md)**.

## Stack

Node 20 + TypeScript · Fastify 5 · Prisma 5 · PostgreSQL 16 · Redis 7 · pnpm workspaces · Docker Compose. (Next.js web app lands in Phase 2.)

## Prerequisites

- Node ≥ 20, pnpm, Docker Desktop (running).

## Quick start

```bash
# 1. Install
pnpm install

# 2. Start datastores (Postgres + Redis)
pnpm db:up

# 3. Create the schema
pnpm db:migrate

# 4. Seed a demo tenant + admin
pnpm db:seed

# 5. Run the API (http://localhost:4000)
pnpm dev
```

Demo login (from seed): `admin@demo.cde.local` / `Password123!`

## Verify it works

```bash
curl http://localhost:4000/health

# Register a new tenant + admin (returns access + refresh tokens)
curl -X POST http://localhost:4000/v1/auth/register \
  -H "content-type: application/json" \
  -d '{"tenantName":"Acme","displayName":"Alice","email":"alice@acme.test","password":"Password123!"}'
```

## Repo layout

```
apps/api          Fastify modular monolith (backend)
apps/web          Next.js web app (Phase 2)
packages/db       Prisma schema, migrations, seed, shared client
docs/             Compressed SPEC / ROADMAP / ARCHITECTURE
docker-compose    Postgres 16 + Redis 7
```

## Root scripts

| Script | Action |
|--------|--------|
| `pnpm dev` | Run the API with hot reload |
| `pnpm db:up` / `db:down` | Start / stop Postgres + Redis |
| `pnpm db:migrate` | Apply Prisma migrations (dev) |
| `pnpm db:seed` | Seed demo data |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm typecheck` | Typecheck all packages |

## API surface (Phase 1)

`/health`, `/health/ready` · `POST /v1/auth/register|token|token/refresh|logout` · `GET /v1/auth/me` · `/v1/organizations` · `/v1/roles` · `/v1/projects` (+ `/members`, `/dashboard`). All errors are RFC 7807 `application/problem+json`.
