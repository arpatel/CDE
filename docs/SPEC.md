# CDE Platform — Technical Specification (Compressed)

Enterprise **Common Data Environment** for construction collaboration. Cloud-native, multi-tenant SaaS, API-first. Source: `CDE_Technical_Specification_v1.0.docx`.

## 1. Architecture

- **Spec target:** microservices on Kubernetes (EKS/AKS), Istio, GitOps.
- **This build:** **modular monolith** — one Node/TS API with clean module boundaries + one Next.js web app, in a pnpm monorepo. Each module maps 1:1 to a future microservice. See `ARCHITECTURE.md`.

**Layers:** Presentation (React/Next web, React Native mobile, IFC viewer, admin) → API Gateway (auth, rate limit, WS) → Microservices (domain-aligned) → Data (Postgres, Redis, Elasticsearch, ClickHouse, S3, SQS).

**Microservices (→ our modules):** Identity, Organization, Project, Document, Drawing, Workflow, RFI, Submittal, Transmittal, Meeting, Snagging, Quality, HSE, Asset, BIM, Forms, Task, Notification, Reporting, Search, Audit, File Storage, Integration.

### Multi-tenancy
Shared infra, `tenant_id` on every tenant-scoped row, enforced at app layer (RLS-ready). File storage isolated by `/{tenantId}/{projectId}/{path}` S3 prefix. Cache key prefix `tenant:{id}:`. ES index per tenant.

### Security
TLS 1.3 in transit, AES-256 at rest. OAuth2 + OIDC, JWT access (15-min TTL) + refresh. PKCE for SPA/mobile. SAML/Entra ID SSO. TOTP MFA. Zero-trust network. WAF. Immutable audit logs (append-only).

### HA / DR
99.9% uptime, RTO < 1h, RPO < 15m. Doc retrieval P95 < 3s. Files up to 5 GB (multipart S3). Continuous + daily backups.

## 2. Modules (key specs)

| # | Module | Core capability |
|---|--------|-----------------|
| 2.1 | **Document Mgmt** | Unlimited folders, version control (major/minor), 5GB uploads via presigned S3, metadata + tags, check-out/in locking, OCR (Textract→ES), full-text + faceted search, retention/legal-hold, full audit |
| 2.2 | **Drawing Mgmt** | Register (discipline/type/scale/status), revisions (A/B/C), browser markup, overlay/ghost compare, distribution matrix, QR linking, hotspots |
| 2.3 | **Workflow Engine** | Configurable approval/review; step types single/group-any/group-all/conditional; conditional routing; SLA + working-day calendar; escalation; delegation; bulk approve; templates; full audit |
| 2.4 | **RFI** | Create→assign→respond→close/void; due dates + overdue alerts; threaded responses; auto-number; transmittal linkage; reporting |
| 2.5 | **Submittals** | Material/shop-drawing/TDS/sample/O&M; register; actions Approved/Approved-as-Noted/Revise/Rejected; revisions; ball-in-court; spec linking |
| 2.6 | **Transmittals** | Internal/external; bundle docs/drawings/RFIs; purpose codes; acknowledgement tracking; auto PDF cover sheet |
| 2.7 | **Meetings** | Types; agenda builder; structured minutes; action items→closure; digital attendance; auto-distribute; recurrence |
| 2.8 | **Snagging/Punch** | Web+mobile; GPS + photos (≤10); pin on drawing; priority; assign to trade; status Open→InProgress→ReadyForInspection→Closed/Disputed; PDF/Excel export |
| 2.9 | **Quality** | NCR (root cause + corrective action); inspection requests (pass/fail/witnessed); test requests; configurable checklists; observations; analytics |
| 2.10 | **HSE** | Incidents (near-miss→fatality); RIDDOR fields; safety observations; toolbox talks + attendance; risk assessments (L×S matrix); permits (hot work/confined/height) + expiry; LTIFR/TRIFR stats |
| 2.11 | **BIM** | IFC 2x3/4 browser viewer; model versioning + federation; element→doc/RFI/NCR linking; Navisworks clash import; BCF import/export; 4D (P6) |
| 2.12 | **Forms** | Drag-drop builder; field types incl. signature/GPS/markup; conditional logic; offline; digital signatures; PDF export; analytics |
| 2.13 | **Reporting** | Project + KPI dashboards; workflow analytics; custom report builder; scheduled email reports; data export; Power BI connector |
| 2.14 | **Mobile** | iOS 15+/Android 10+ (React Native); offline cache + sync; camera/GPS/QR; push; biometric auth |

## 3. API Design

- Base `https://api.cde.example.com/v1`; HTTPS only; URI versioning; 12-month deprecation.
- Auth: Bearer JWT; refresh via `POST /auth/token/refresh`.
- JSON; ISO-8601 UTC; cursor pagination `?cursor=&limit=` (max 200); sort `?sort=field:desc`; filter `?filter[k]=v`; sparse `?fields=`.
- Errors: **RFC 7807** Problem Details `{type,title,status,detail,instance}`.
- Rate limit 1000/min/key → 429 + `Retry-After`. Idempotency-Key on POST.

**Key endpoints:** `/auth/token`, `/auth/mfa/verify`; `/projects`, `/projects/{id}/members|dashboard`; `/projects/{id}/documents` (+ upload-url, checkout, checkin, revisions, search); `/workflow-templates`, `/projects/{id}/workflows/.../approve|reject|delegate`, `/me/pending-approvals`; `/projects/{id}/rfis/.../respond|close|void`; `/projects/{id}/ncrs|inspections|hse/incidents|hse/permits`; `/me/notifications`; `/organizations/{id}/webhooks`.

**Webhook events:** document.uploaded/approved/rejected, rfi.created/responded/closed, submittal.created/status_changed, ncr.created, incident.reported, workflow.completed/sla_breached.

**Error codes:** 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 422 UNPROCESSABLE, 429 RATE_LIMITED, 500 INTERNAL_ERROR, 503 SERVICE_UNAVAILABLE.

## 4. Data Model

**Principles:** schema-per-service ideal (here: shared schema, module-owned tables). Every table: `id` (uuid), `tenant_id`, `created_at`, `updated_at`, `created_by`, `is_deleted`, `version` (optimistic lock). RLS for tenant isolation. JSONB for dynamic metadata only.

**Core tables by domain:**
- **Identity/Org:** tenants, organizations (self-ref tree), users, user_org_memberships, roles (jsonb perms), sso_configurations, sessions, audit_logs.
- **Project:** projects, project_members, project_milestones, project_templates, project_calendars.
- **Document:** folders (materialized path), documents (current_revision_id, locked_by), document_revisions (file_key, checksum, ocr_text), document_metadata, document_tags, document_permissions.
- **Workflow:** workflow_templates (steps jsonb), workflow_instances, workflow_steps, workflow_escalations.
- **RFI:** rfis, rfi_responses, rfi_attachments.
- **Submittal:** submittals, submittal_revisions, submittal_reviews.
- **Quality/HSE:** ncrs, inspections, checklists, hse_incidents, permits, safety_observations.
- **Asset:** assets, asset_documents, asset_maintenance.

**Indexing:** documents(project_id,folder_id,is_deleted); document_revisions(document_id,revision_number desc); workflow_steps(assignee_id,status,due_date); rfis(project_id,status,due_date); audit_logs(tenant_id,resource_type,resource_id,ts desc); GIN on ocr_text.
