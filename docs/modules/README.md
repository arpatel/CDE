# Module Documentation Index

Per-module specs for the CDE platform. Each file covers: **Purpose · Endpoints · Data model · Lifecycle & business rules · Permissions · Status / pending.**

Conventions shared by all modules: tenant isolation via `tenant_id`, RFC 7807 errors, Zod validation, append-only audit, soft-delete + optimistic lock, RBAC permission guards. See [../../CLAUDE.md](../../CLAUDE.md) and [../ARCHITECTURE.md](../ARCHITECTURE.md).

## Foundation (Phase 1)
- [identity.md](identity.md) — Auth, JWT, refresh, registration, MFA/SSO (planned)
- [organization.md](organization.md) — Tenant organisation tree (as-built)
- [organization-blueprint.md](organization-blueprint.md) — **Full enterprise spec** (Business Story · BRD · FRS · User Stories · UI · DB · APIs · Permissions · Notifications · Reports · Audit · Testing)
- [rbac-roles.md](rbac-roles.md) — Roles & permission model
- [users.md](users.md) — Admin user provisioning (create users, assign org + role)
- [project.md](project.md) — Projects, members, dashboard (as-built)
- [project-blueprint.md](project-blueprint.md) — **Full enterprise spec** (Business Story · BRD · FRS · User Stories · UI · DB · APIs · Permissions · Reports · Audit · Testing)

## Documents & Workflow (Phase 2)
- [documents.md](documents.md) — Document register, revisions, check-out/in, upload
- [drawings.md](drawings.md) — Drawing register & revisions
- [workflow.md](workflow.md) — Configurable approval/review engine
- [rfi.md](rfi.md) — Requests for Information
- [submittals.md](submittals.md) — Submittals, revisions, reviews
- [transmittals.md](transmittals.md) — Transmittals (bundling, acknowledgement)
- [meetings.md](meetings.md) — Meetings, agenda, minutes, actions

## Field & Quality (Phase 3)
- [snagging.md](snagging.md) — Snagging / punch list
- [quality.md](quality.md) — NCRs, inspections, checklists
- [hse.md](hse.md) — Incidents, permits, safety observations
- [forms.md](forms.md) — Dynamic forms (templates + submissions)
- [tasks.md](tasks.md) — Personal / team tasks
- [assets.md](assets.md) — Asset register
- [notifications.md](notifications.md) — In-app notifications

## Legend
- ✅ **running** — built, migrated, smoke-tested
- 🟡 **partial** — core built, sub-resources/lifecycle pending
- ⏭ **planned** — in spec, not yet built
