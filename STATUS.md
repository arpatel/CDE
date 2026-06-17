# Build Status

_Last verified: 2026-06-14 — Foundation **and** all domain modules running and smoke-tested end-to-end._

## ✅ Running now

### Foundation (Phase 1)
- **Infra:** runs on **local PostgreSQL 18** (port 5433, database `CDE`, role `cde`). Migrations applied + demo seed loaded. (Docker Compose remains an optional fallback DB.)
- **Admin user management:** Tenant Admin creates **organisations → users (assigned org + role) → projects**; new users log in with role-based permissions. Verified end-to-end on local Postgres. Web pages under **Admin** (Organizations, Users, Projects).
- **API:** Fastify on `:4000`, RFC 7807 errors, request correlation, pretty logs, bodyless-POST tolerant.
- **Identity/Auth:** self-service tenant registration, password login, JWT access (15m) + hashed rotating refresh tokens, logout, `/auth/me`.
- **RBAC:** role-based permission guard; system roles (Tenant Admin/PM/Member) auto-provisioned per tenant.
- **Multi-tenancy:** `tenant_id` on every row, pinned from JWT, enforced in every query.
- **Organizations / Roles / Projects:** CRUD (+ org tree, members, dashboard). Creator auto-added as member.
- **Audit:** append-only audit log on every create/update/delete.

### Domain modules (Phase 2–3 backend) — all live
Driven by a generic tenant+project-scoped CRUD factory (auto-numbering, soft-delete, optimistic lock, audit) plus lifecycle endpoints:

- **Documents:** CRUD, presigned upload-url (local stub → S3 later), revisions, check-out/check-in locking. Folder tree (nested) + per-folder Doc Ref uniqueness, folder defaults, document register (upload date/author), online file viewer, and configurable attributes captured on upload.
- **Folder access control:** folders **private by default**; per-folder grants to user/role at **view / edit (upload) / manage** levels with inherit-from-nearest-ancestor + copy-on-override. Enforced server-side on visibility, upload/revise/metadata-edit, and access changes; creator + superusers bypass.
- **Drawings:** register CRUD + revisions.
- **Workflow engine:** start instance with N steps, sequential `approve`/`reject` advancing, auto-complete, `/me/pending-approvals`.
- **RFI:** CRUD + `respond` (threaded) + `close`/`void`, auto-number.
- **Submittals:** CRUD + revisions + review (approved/approved-as-noted/revise/rejected → status).
- **Transmittals, Meetings:** CRUD.
- **Snagging, NCR/Quality, Inspections, Checklists:** CRUD + filters.
- **HSE:** incidents, permits (+ `approve`), safety observations.
- **Assets, Forms (templates + submissions), Tasks:** CRUD.
- **Notifications:** `/me/notifications` + mark-read.

### Smoke tests (all green)
- Foundation: register → me → org → project → list → dashboard → login → refresh-rotate → 401 guard → 409 dup-code. **10/10.**
- Domain: documents (upload-url→revision→checkout/checkin), RFI (respond→close), submittal (revision→review), workflow (2-step approve→completed, reject→rejected, pending-approvals 1→0), + create/update/soft-delete across all 17 modules with auto-numbering (DOC/RFI/SUB/SNG/NCR/INC/PMT/AST/DWG/TR-001…). **All green.**

### Web app (`apps/web`) — running on `:3000`
Next.js 14 (App Router, TS) port of the UI prototype, wired to the live API:
- Login + self-service tenant registration; JWT stored client-side with silent refresh.
- App shell (topbar + project switcher + sidebar) with auth gating.
- **Dashboard** (live counters), **Documents** (create + presigned upload→revision + check-out/in), **RFI** (create + respond + close), **Workflows** (start + approve/reject pending), **Snagging / Drawings / Submittals / NCR / HSE** (list + create).
- All 10 routes compile clean; web typecheck green; CORS verified web→API.

Run both: `pnpm dev:all` (API `:4000` + web `:3000`).

## ⏭ Next

- **Real file storage:** swap the local upload stub for an S3 adapter behind the same `upload-url` contract.
- **Workflow depth:** SLA timers, escalation, delegation, parallel (group-any/group-all) steps, templates.
- **Search + OCR:** Elasticsearch indexing + Textract pipeline for documents.

## Backlog (Phase 4–5)

BIM (IFC viewer) · reporting/analytics (ClickHouse) + Power BI · integrations (P6/M365/SAP) + webhooks · mobile (React Native) + offline · hardening: Postgres **RLS**, argon2id, rate limiting, load/pen test, WCAG AA, i18n, DR.

## Known shortcuts (intentional, tracked)

- Password hashing = scrypt (stdlib); swap to argon2id before production.
- Permissions resolved per-request from DB; add Redis cache when hot.
- Tenant isolation enforced in app layer; add Postgres **RLS** as defence-in-depth.
- Login resolves user by email globally in dev; require tenant domain/SSO routing for prod.
