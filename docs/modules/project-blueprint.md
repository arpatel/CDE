# Project Module — Enterprise Blueprint

> Implementation-ready specification for the **Project** module — the operational container every domain record (documents, RFIs, snags, workflows…) belongs to.
> Audience: BA · Solution/DB/Security/Cloud Architects · Dev · QA · DevOps · Product · Construction domain.
> Status legend: **[built]** in code today · **[partial]** core exists, extension needed · **[proposed]** designed here, not yet built.

## 0. Reality check & gap analysis (read first)

| Area | Today | Gap to close |
|---|---|---|
| Core entity | `projects(id, tenant_id, name, code, status, start_date, end_date, owner_org_id, created_by, is_deleted, version, ts)` **[built]** | No portfolio/program, parent/child, phases, numbering scheme, metadata, custom fields, location hierarchy |
| Membership | `project_members(project_id, user_id, organization_id, role_id, invited_by, accepted_at)` **[built]** | No org-level participation (org joins project with a role independent of individual users), no team grouping |
| Lifecycle | Create, update, soft-delete (archive), dashboard **[built]** | No Clone, Reopen, phase gates, formal status state-machine + history |
| Templates | none | Folder templates, workflow templates, project templates, numbering schemes **[proposed]** |
| Locations | none | Building → Floor → Zone breakdown structure **[proposed]** |
| Calendars | none | Working calendar per project (drives SLA/working-days) **[proposed]** |
| Dashboard | counts members + zero placeholders **[partial]** | Aggregate live module counters (docs/RFIs/snags/approvals/overdue) |
| Security | tenant-scoped + RBAC perms **[built]** | Project-scoped roles, org-data isolation on shared projects (RLS) |

**Challenged assumptions / gaps identified**
1. *"A project is flat"* — **No.** Enterprises run **Portfolio → Program → Project → Sub-project (parent/child)** and within a project a **Phase → Stage** timeline. Model the hierarchy explicitly or roll-up reporting is impossible.
2. *"A user joins a project"* — partly. The **organization** joins the project with a role (e.g., Contractor), and **users** of that org inherit project access. Today only users are linked; add org-on-project participation.
3. *"Location = free text"* — **No.** Construction needs a **spatial breakdown** (Building/Floor/Zone) reused by snags, inspections, RFIs, BIM. Model it.
4. *"One numbering scheme"* — configurable **per project**, per document type (e.g., `{PROJ}-{DISC}-{SEQ}`). Don't hardcode.
5. *Hard delete* — forbidden; a project with documents/contracts is **archived**, never deleted. Reopen must be possible.
6. *Calendars matter* — SLA "2 working days" depends on the project calendar (weekend = Fri/Sat in GCC). Without it, SLA math is wrong.

---

## 1. Business Story

### 1.1 Vision
A single, configurable command-center for the entire delivery hierarchy — portfolio to zone — where every project is spun up in minutes from governed templates (folders, workflows, numbering, roles, calendar), and every stakeholder organization collaborates with strict data ownership. Surpasses Aconex/Procore/ACC where project setup is rigid, template reuse is weak, and spatial/portfolio modelling is shallow.

### 1.2 Objectives
- Stand up a fully-configured project (structure, team, templates, numbering, calendar, locations) in < 15 min.
- Roll up status/KPIs across **portfolio → program → project**.
- Enforce per-project, per-org access with auditable governance.
- Reuse everything via templates; nothing hardcoded.

### 1.3 Business Value
- ↓ project setup from days to minutes; consistent governance across projects.
- ↑ executive visibility (portfolio roll-ups) → better capital decisions.
- ↓ mis-filing / wrong numbering → cleaner records, faster retrieval, audit-ready.
- Data ownership on shared projects → safe multi-company collaboration.

### 1.4 Competitor gaps
| Capability | Aconex | Procore | ACC | **This CDE (target)** |
|---|---|---|---|---|
| Portfolio/Program roll-up | Partial | Partial | Partial | **Yes** |
| Parent/child sub-projects | Limited | Limited | Limited | **Yes** |
| Configurable numbering per type | Partial | Partial | Partial | **Yes** |
| Folder + workflow templates | Partial | Partial | Yes | **Yes** |
| Spatial breakdown (Bldg/Floor/Zone) | Partial | Yes | Yes | **Yes (reused everywhere)** |
| Working calendars driving SLA | Partial | Partial | Partial | **Yes** |
| Org-data isolation on shared project | Partial | Partial | Partial | **Yes (RLS)** |
| Clone project from existing | Limited | Yes | Partial | **Yes** |

### 1.5 Complete lifecycle (request → closure)
`Request/Intake → Draft → (Setup: structure/templates/team/numbering/calendar/locations) → Active → [Phase gates: Design → Tender → Construction → Commissioning → Handover] → (On Hold ↔ Active) → Completed → Archived → (Reopen if needed)`

### 1.6 User journey (PMO sets up a new project)
1. Tenant/PMO admin → **Projects → New** (blank or **From Template/Clone**).
2. Identity: name, code, portfolio/program, parent (optional), type, dates, owner org.
3. Apply **folder template**, **workflow templates**, **numbering scheme**, **calendar**.
4. Define **locations** (buildings/floors/zones) and **phases**.
5. Add **participating organizations** + invite **team members** with roles.
6. Activate → project live; modules (docs/RFI/snag/…) now usable, scoped to the project.

### 1.7 Stakeholders
PMO/Portfolio Manager, Program Manager, Project Manager, Project Admin, Tenant/Super Admin, Participating Org Admin, Discipline Lead, Team Member, Client/Owner rep, Auditor, Security Officer.

### 1.8 KPIs
| KPI | Target |
|---|---|
| Project setup time (template) | < 15 min |
| Projects created from templates | > 80% |
| Schedule milestone adherence | ≥ 90% on-time |
| Open vs closed items SLA compliance | > 85% |
| Cross-project numbering collisions | 0 |
| Portfolio roll-up freshness | < 5 min |
| Access violations (cross-org leak) | 0 |

### 1.9 Risks
| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| Over-complex setup deters users | Med | Med | Templates + clone + sensible defaults + wizard |
| Numbering scheme misconfig → duplicates | Med | High | Validation + uniqueness + preview before activate |
| Cross-org data leak on shared project | Low | Critical | Org-ownership model + Postgres RLS + tests |
| Template drift across projects | Med | Med | Versioned templates; changes don't retro-mutate live projects |
| Calendar/timezone errors skew SLA | Med | High | IANA tz per project; working-day engine unit-tested |
| Archive of project with legal hold | Low | High | Legal-hold flag blocks purge |

---

## 2. BRD

### 2.1 Scope
Project CRUD + Clone + Archive + Reopen; portfolio/program/parent-child hierarchy; phases; participating organizations + teams + members with roles; calendars; location breakdown (building/floor/zone); folder/workflow/project templates; numbering schemes; metadata + custom fields; dashboard roll-ups; notifications; audit; security/RLS.

### 2.2 Out of Scope
Document/RFI/snag internals (their own modules), cost/budget management, scheduling engine (P6 integration is a connector), e-signature, billing.

### 2.3 Business Rules
| ID | Rule |
|---|---|
| BR-01 | Every project belongs to exactly one tenant; `tenant_id` immutable. |
| BR-02 | `code` unique per tenant; immutable after first document/record is created. |
| BR-03 | Status transitions follow the state machine; illegal transitions → 422. |
| BR-04 | A project cannot be hard-deleted while referenced; Archive only; Reopen allowed from Archived/Completed. |
| BR-05 | Numbering scheme must be valid and unique-producing before project Activation. |
| BR-06 | An organization participates in a project with exactly one primary role (extra roles as tags). |
| BR-07 | A user must belong to a participating organization (or tenant) to be a project member. |
| BR-08 | Phases are ordered; a phase gate cannot close while mandatory items are open (configurable). |
| BR-09 | Templates are versioned; applying a template copies values, not references. |
| BR-10 | Location codes unique within their parent (zone code unique within floor, etc.). |
| BR-11 | Every CUD + lifecycle + membership change is audited. |
| BR-12 | Cloning copies structure/templates/locations/roles but NOT documents or transactional data. |

### 2.4 Functional Requirements (summary)
Create/Edit/Clone/Archive/Reopen; Portfolio/Program mgmt; Parent-child linking; Phases; Teams & members; Participating orgs; Roles; Calendars; Locations (building/floor/zone); Folder templates; Workflow templates; Numbering; Metadata; Custom fields; Dashboard; Notifications; Audit; Security/RLS; Bulk ops; Export.

### 2.5 Non-Functional Requirements
| NFR | Target |
|---|---|
| Performance | Project list P95 < 400 ms; dashboard roll-up < 1.5 s @ 10k projects |
| Scalability | 10 → 1M projects/tenant; cursor pagination; materialized roll-up views |
| Availability | 99.9%; stateless API; HA Postgres |
| Security | RBAC + project-scoped roles + Postgres RLS; org-data isolation; OWASP Top-10 |
| Auditability | Append-only, field-level diffs, 7-yr retention |
| Configurability | Templates/numbering/calendars/custom-fields per tenant & project; zero redeploy |
| i18n/l10n | Per-project locale/timezone/calendar |
| Accessibility | WCAG 2.1 AA |
| Observability | Structured logs/metrics/traces; correlation id |

### 2.6 Assumptions & 2.7 Dependencies
Assumes Identity/RBAC/Audit/Notification/Org modules operational; tenant exists. Depends on Organization (participation), Document (folder templates), Workflow (workflow templates), Calendar engine (SLA), File storage (exports).

---

## 3. FRS (per feature: Purpose · Workflow · Preconditions · Validations · Exceptions · Acceptance · Business Rules · Edge cases)

### F-01 Create Project
- **Purpose:** stand up a new project container. **Actors:** PMO/PM/Super Admin (`project:create`).
- **Workflow:** New (blank/template/clone) → identity + hierarchy + dates + owner org → apply templates/numbering/calendar → `POST /projects` → status `DRAFT`/`ACTIVE` → creator auto-added as member → audit `project.created`.
- **Preconditions:** authenticated; permission; tenant active.
- **Validations:** name 2–160; code unique/tenant, `[A-Za-z0-9._-]`; dates `start ≤ end`; owner org in tenant; portfolio/program/parent in tenant & acyclic.
- **Exceptions:** dup code → 409; invalid parent (cycle) → 422.
- **Acceptance:** project persisted, creator is member, audit emitted.
- **Edge:** create from template applies folders/workflows/numbering; clone copies structure not data.

### F-02 Edit Project
- **Purpose:** maintain attributes. **Validations:** `tenant_id`/`code` immutability rules (BR-02); optimistic lock `version`. **Exceptions:** stale version → 409; edit Archived → 422. **Acceptance:** field-level audit diff, version++.

### F-03 Clone Project
- **Purpose:** rapid setup from an existing project. **Workflow:** select source → choose what to copy (structure, locations, phases, templates, numbering, roles, participating orgs) → new code → create. **Business rule:** never copies documents/RFIs/transactional data. **Acceptance:** new project mirrors selected config only.

### F-04 Archive / F-05 Reopen
- **Archive:** `POST /projects/{id}/archive` → status Archived + history; blocks edits & new transactional records; data retained. **Reopen:** `POST /projects/{id}/reopen` from Archived/Completed → Active. **Exceptions:** illegal transition → 422; legal hold blocks purge (not archive). **Acceptance:** history + audit; access recomputed.

### F-06 Portfolio / F-07 Program management
- **Purpose:** group projects for roll-up. **Workflow:** create portfolio → program(s) under it → assign projects. **Validations:** unique name/tenant; program belongs to one portfolio. **Acceptance:** roll-up KPIs aggregate child projects.

### F-08 Parent/Child Project (sub-projects)
- **Purpose:** decompose large delivery. **Validations:** same tenant, acyclic, max depth (configurable). **Acceptance:** child inherits selected defaults; roll-up to parent.

### F-09 Phases
- **Purpose:** lifecycle stages (Design/Tender/Construction/Commissioning/Handover). **Workflow:** define ordered phases with planned dates + gate criteria → advance/close gate. **Business rule:** gate close blocked if mandatory open items (configurable). **Acceptance:** phase status + gate audit.

### F-10 Teams / F-11 Participating Organizations / F-12 Roles
- **Org participation:** add org to project with a primary role. **Team:** named group of members within the project. **Members:** user + project role (+ team). **Validations:** user in participating org/tenant; role in tenant; unique (project,user). **Edge:** suspended org cannot be added; removing participation retains history.

### F-13 Calendars
- **Purpose:** working-day calendar (week pattern + holidays + exceptions) driving SLA. **Validations:** IANA timezone; non-overlapping exceptions. **Acceptance:** SLA computations use project calendar.

### F-14 Locations (Building → Floor → Zone)
- **Purpose:** spatial breakdown reused by snags/inspections/RFIs/BIM. **Workflow:** define buildings → floors → zones with codes. **Validations:** code unique within parent. **Acceptance:** location picker available to other modules.

### F-15 Folder Templates / F-16 Workflow Templates / F-17 Numbering
- **Folder template:** predefined folder tree + permissions applied on project create. **Workflow template:** reusable approval/review definitions attached to doc types. **Numbering:** pattern `{PROJ}-{DISC}-{TYPE}-{SEQ:0000}` per document type; preview + uniqueness. **Acceptance:** applying template materializes config into the project; numbering generates unique numbers.

### F-18 Metadata / F-19 Custom Fields
- Tenant-defined fields on projects (type/required/options/regex); validated on save; exportable.

### F-20 Dashboard
- **Purpose:** live project health. **Contents:** counts by module (docs, open RFIs, open snags, pending approvals, overdue), phase progress, milestones, recent activity. **Acceptance:** counters reflect live data (< 5 min staleness).

### F-21 Notifications / F-22 Audit / F-23 Security
- Notifications on create/status/membership/phase-gate; full audit; project-scoped RBAC + RLS + org-data isolation.

---

## 4. User Stories

| ID | Story | AC | Pts | Pri | Deps |
|---|---|---|---|---|---|
| PS-01 | As a **PM** I want to **create a project** so delivery can start. | Identity+code unique; creator=member; audit | 5 | Must | Org, RBAC |
| PS-02 | As a **PM** I want to **edit** a project so details stay accurate. | Optimistic lock; field diff audit | 3 | Must | — |
| PS-03 | As a **PMO** I want to **clone** a project so setup is fast. | Copies config not data; new code | 8 | Should | Templates |
| PS-04 | As a **PM** I want to **archive** a project so obsolete work leaves active use. | Blocks edits; data intact; history | 3 | Must | — |
| PS-05 | As a **PM** I want to **reopen** an archived/completed project. | Legal transition; audit | 2 | Should | — |
| PS-06 | As a **PMO** I want **portfolios/programs** so I can roll up KPIs. | Group + aggregate; unique names | 8 | Should | Reporting |
| PS-07 | As a **PMO** I want **parent/child** projects so large works decompose. | Acyclic; roll-up to parent | 5 | Should | — |
| PS-08 | As a **PM** I want **phases with gates** so lifecycle is governed. | Ordered; gate-close rule; audit | 8 | Should | Items modules |
| PS-09 | As a **PM** I want to **add organizations** to a project with a role. | Per-project role; suspended blocked | 5 | Must | Org |
| PS-10 | As a **PM** I want to **add members & teams** with roles. | User in participating org; unique | 5 | Must | RBAC |
| PS-11 | As a **PM** I want a **working calendar** so SLA is accurate. | tz + holidays; SLA uses it | 5 | Should | Workflow |
| PS-12 | As a **PM** I want **locations (bldg/floor/zone)** reused by other modules. | Code unique in parent; picker exposed | 8 | Should | Snag/QA |
| PS-13 | As a **PMO** I want **folder/workflow templates** applied on create. | Materialized into project | 8 | Should | Doc/Workflow |
| PS-14 | As a **PMO** I want **numbering schemes** per type. | Pattern + preview + uniqueness | 5 | Must | Doc |
| PS-15 | As an **Admin** I want **custom fields** on projects. | Type/validation; export | 5 | Could | — |
| PS-16 | As a **PM** I want a **dashboard** of project health. | Live counters; < 5 min | 5 | Must | All modules |
| PS-17 | As an **Auditor** I want a **full audit trail**. | Immutable; field-level; filter | 5 | Must | Audit |

Common exceptions: 403 unauthorized; 400 validation; 409 conflict (dup code/stale version); 422 illegal transition/business rule.

---

## 5. UI Documentation

### 5.1 Pages
1. **Projects list** (`/projects`) — grid: Name, Code, Portfolio/Program, Type, Status (pill), Phase, Start–End, #Members, Health. Toolbar: search, filters (status/portfolio/program/type/owner org), sort, **+ New**, **From Template**, **Clone**, Export, Columns. Card view < 768px.
2. **Create/Edit wizard** — Steps: ① Identity (name, code, type, portfolio, program, parent, owner org, dates) ② Templates (folder/workflow/numbering/calendar) ③ Locations & Phases ④ Team & Orgs ⑤ Custom fields ⑥ Review/Activate. Inline validation, autosave draft, numbering **preview**.
3. **Project detail** (`/projects/{id}`) — tabs:
   - **Overview** (identity, status, phase, dates, owner, health cards).
   - **Team** (members grid + invite; teams).
   - **Organizations** (participation grid: org, role, joined, status).
   - **Phases** (timeline + gate status).
   - **Locations** (building/floor/zone tree CRUD).
   - **Templates & Numbering** (applied folder/workflow templates; numbering schemes + preview).
   - **Calendar** (week pattern + holidays).
   - **Custom Fields** (dynamic form).
   - **Dashboard** (live counters, milestones, activity).
   - **Audit** (timeline).
4. **Portfolio/Program admin** (`/admin/portfolios`) — tree + assign projects.
5. **Numbering / Folder / Workflow template admin** (`/admin/templates`).
6. **Clone dialog** — source picker + checkboxes (structure/locations/phases/templates/numbering/roles/orgs) + new code.

### 5.2 Field inventory — Create wizard Step ① (Identity)
| Field | Control | Required | Validation | Searchable | Filterable | Sortable |
|---|---|---|---|---|---|---|
| Name | text | Yes | 2–160 | Yes | No | Yes |
| Code | text | Yes | unique/tenant, `[A-Za-z0-9._-]` | Yes | No | Yes |
| Type | select (config) | Yes | in list | No | Yes | Yes |
| Portfolio | select | No | tenant | No | Yes | No |
| Program | select | No | within portfolio | No | Yes | No |
| Parent project | autocomplete | No | tenant, acyclic | No | Yes | No |
| Owner organization | select | No | tenant org | No | Yes | No |
| Start / End date | date | No | start ≤ end | No | Yes | Yes |
| Status | select | No | state machine | No | Yes | Yes |
| Description | textarea | No | ≤2000 | Yes | No | No |

### 5.3 Controls / states / accessibility
Primary Save/Activate; Destructive Archive (type-to-confirm); Reopen confirm. Numbering preview live-updates. Disabled lifecycle buttons reflect legal transitions. WCAG 2.1 AA: contrast, focus, ARIA, keyboard, screen-reader async announcements, RTL for RTL locales.

---

## 6. Database Design

> Postgres 18; UUID PK; `tenant_id` scoped; audit/soft-delete/version conventions; cross-module refs are scalar IDs.

### 6.1 Table: `projects` (primary) **[built, to extend]**
Purpose: project master. PK `id`. FK (scalar) tenant_id, owner_org_id, portfolio_id, program_id, parent_id, calendar_id, numbering_scheme_id. Soft delete `is_deleted`; version. Partition by tenant_id (hash) at scale. Indexes per below.

| Column | Type | Len | Null | Default | Validation | Meaning | Example | UI | Srch | Filt | Sort | Idx | Enc | Aud | API name | Why |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| id | uuid | – | N | gen | – | PK | – | – | N | N | N | PK | N | Y | id | identity |
| tenant_id | uuid | – | N | – | FK tenant | isolation | – | hidden | N | Y | N | Y | N | Y | tenantId | multi-tenancy |
| name | varchar | 160 | N | – | 2–160 | project name | "Dubai Metro P4" | text | Y | N | Y | Y(trgm) | N | Y | name | identity |
| code | varchar | 40 | N | – | unique/tenant | short code | "DMPH4" | text | Y | Y | Y | uniq(tenant,code) | N | Y | code | numbering/refs |
| type | varchar | 40 | Y | – | config list | delivery type | "INFRASTRUCTURE" | select | N | Y | Y | Y | N | Y | type | classification |
| status | varchar | 30 | N | 'PLANNING' | state machine | lifecycle | "ACTIVE" | pill | N | Y | Y | Y | N | Y | status | governance |
| portfolio_id | uuid | – | Y | – | FK | roll-up group | – | select | N | Y | N | Y | N | Y | portfolioId | portfolio mgmt |
| program_id | uuid | – | Y | – | FK in portfolio | program group | – | select | N | Y | N | Y | N | Y | programId | program mgmt |
| parent_id | uuid | – | Y | – | acyclic | sub-project link | – | autocomplete | N | Y | N | Y | N | Y | parentId | decomposition |
| owner_org_id | uuid | – | Y | – | tenant org | lead org | – | select | N | Y | N | Y | N | Y | ownerOrgId | accountability |
| calendar_id | uuid | – | Y | – | FK | working calendar | – | select | N | N | N | Y | N | Y | calendarId | SLA |
| numbering_scheme_id | uuid | – | Y | – | FK | default numbering | – | select | N | N | N | Y | N | Y | numberingSchemeId | numbering |
| start_date | date | – | Y | – | ≤ end | planned start | – | date | N | Y | Y | Y | N | Y | startDate | scheduling |
| end_date | date | – | Y | – | ≥ start | planned end | – | date | N | Y | Y | Y | N | Y | endDate | scheduling |
| description | text | – | Y | – | ≤2000 | summary | – | textarea | Y | N | N | N | N | Y | description | context |
| current_phase_id | uuid | – | Y | – | FK phases | active phase | – | – | N | Y | N | Y | N | Y | currentPhaseId | lifecycle |
| created_by | uuid | – | Y | – | – | creator | – | hidden | N | N | N | Y | N | Y | createdBy | accountability |
| legal_hold | bool | – | N | false | – | blocks purge | false | toggle | N | Y | N | N | N | Y | legalHold | compliance |
| is_deleted | bool | – | N | false | – | soft delete/archive | false | hidden | N | Y | N | Y | N | Y | isDeleted | retention |
| version | int | – | N | 1 | – | optimistic lock | 1 | hidden | N | N | N | N | N | Y | version | concurrency |
| created_at/updated_at | timestamptz | – | N | now() | – | timestamps | – | – | N | Y | Y | Y | N | Y | createdAt/updatedAt | audit |

Indexes: PK; `uniq(tenant_id, code)`; `(tenant_id, status, is_deleted)`; `(tenant_id, portfolio_id)`,`(tenant_id, program_id)`,`(parent_id)`; GIN trigram on `name`.

### 6.2 Supporting tables (purpose · key columns)
| Table | Purpose | Key columns |
|---|---|---|
| `portfolios` | top roll-up group | id, tenant_id, name, code, owner_id |
| `programs` | mid roll-up group | id, tenant_id, portfolio_id, name, code |
| `project_members` **[built]** | user membership | id, project_id, user_id, organization_id, role_id, team_id, invited_by, accepted_at |
| `project_organizations` | org participation | id, tenant_id, project_id, organization_id, role, status, joined_at ; uniq(project_id,organization_id) |
| `project_teams` | named team groups | id, project_id, name, lead_user_id |
| `project_phases` | lifecycle phases | id, project_id, name, ordinal, planned_start, planned_end, status, gate_criteria(jsonb) |
| `project_calendars` | working calendar | id, tenant_id, project_id, timezone, work_week(jsonb), holidays(jsonb) |
| `locations` | spatial breakdown | id, tenant_id, project_id, parent_id, kind(building/floor/zone), name, code ; uniq(parent_id,code) |
| `numbering_schemes` | number patterns | id, tenant_id, name, pattern, applies_to(doc_type), seq_padding, scope |
| `numbering_counters` | atomic sequences | scheme_id, project_id, scope_key, next_value ; uniq(scheme_id,project_id,scope_key) |
| `folder_templates` | folder tree defs | id, tenant_id, name, tree(jsonb) |
| `workflow_templates` **[built]** | approval defs | id, tenant_id, name, module, steps(jsonb) |
| `project_templates` | full project preset | id, tenant_id, name, config(jsonb) |
| `project_custom_fields` / `_values` | extensibility | field defs + values(jsonb) |
| `project_status_history` | lifecycle audit | id, project_id, from_status, to_status, reason, changed_by, changed_at |
| `project_milestones` | key dates/gates | id, project_id, name, due_date, status, linked_phase_id |

### 6.3 Governance
Partition `projects`/`project_members` by tenant_id at scale; read replicas for portfolio roll-ups (or materialized views refreshed every N min); PITR + snapshots; audit 7y; archive ≠ purge (purge only via GDPR/retention with no legal hold). RLS on every project-scoped table by `tenant_id` (+ org-ownership for shared-project isolation).

---

## 7. API

Base `/v1`. Auth Bearer JWT (tenant context). AuthZ per row. Errors RFC 7807. Idempotency-Key on POST. Cursor pagination. Rate limit 1000/min/key (heavier on bulk/clone).

| Route | Method | Perm | Request (key) | Success | Errors |
|---|---|---|---|---|---|
| `/projects` | GET | `project:read` | filters,q,cursor,sort | 200 list | 401/403 |
| `/projects` | POST | `project:create` | name,code,type,portfolioId?,programId?,parentId?,ownerOrgId?,dates,templateId? | 201 | 400/403/409/422 |
| `/projects/{id}` | GET | `project:read` | – | 200 | 404 |
| `/projects/{id}` | PATCH | `project:update` | partial+version | 200 | 400/409/422 |
| `/projects/{id}/clone` | POST | `project:create` | newCode, copy[] | 201 | 400/409 |
| `/projects/{id}/archive` | POST | `project:update` | reason | 200 | 422 |
| `/projects/{id}/reopen` | POST | `project:update` | – | 200 | 422 |
| `/projects/{id}/members` | GET/POST/DELETE | `project:read`/`project:member:manage` | userId,roleId,teamId | 2xx | 4xx |
| `/projects/{id}/organizations` | GET/POST/DELETE | `project:read`/`project:member:manage` | organizationId,role | 2xx | 4xx |
| `/projects/{id}/teams` | GET/POST/PATCH | member:manage | name,leadUserId | 2xx | 4xx |
| `/projects/{id}/phases` | GET/POST/PATCH | `project:update` | name,ordinal,dates,gate | 2xx | 4xx |
| `/projects/{id}/phases/{pid}/advance` | POST | `project:update` | – | 200 | 422 (open items) |
| `/projects/{id}/locations` | GET/POST/PATCH/DELETE | `project:update` | kind,name,code,parentId | 2xx | 4xx |
| `/projects/{id}/calendar` | GET/PUT | `project:update` | timezone,workWeek,holidays | 2xx | 4xx |
| `/projects/{id}/numbering` | GET/PUT | `project:update` | schemeId/pattern | 2xx | 4xx |
| `/projects/{id}/custom-field-values` | PUT | `project:update` | values[] | 200 | 422 |
| `/projects/{id}/dashboard` | GET | `project:read` | – | 200 counters | 404 |
| `/portfolios` `/programs` | GET/POST/PATCH | `portfolio:manage` | name,code | 2xx | 4xx |
| `/admin/project-templates` `/folder-templates` `/numbering-schemes` | CRUD | `project-config:manage` | defs | 2xx | 4xx |
| `/projects/{id}/audit` | GET | `audit:read` | filters | 200 | 403 |

Audit events: `project.created/updated/cloned/archived/reopened`, `project.member.added/removed`, `project.org.added/removed`, `project.phase.created/advanced`, `project.location.*`, `project.calendar.updated`, `project.numbering.updated`, `project.customfields.updated`. Error codes per platform standard (400/401/403/404/409/422/429).

---

## 8. Permissions

Permissions: `project:{read,create,update,member:manage}`, `portfolio:manage`, `project-config:manage`, `audit:read`. `*` = super admin.

| Action / Role | Super Admin (`*`) | PMO/Portfolio | Program Mgr | Project Manager | Project Admin | Team Member | Participating Org Admin | Auditor |
|---|---|---|---|---|---|---|---|---|
| View project | ✅ | portfolio scope | program scope | own projects | own project | own project | own org’s projects | ✅ |
| Create project | ✅ | ✅ | ✅ | (config) | – | – | – | – |
| Edit project | ✅ | ✅ | program scope | ✅ | ✅ | – | – | – |
| Clone | ✅ | ✅ | – | ✅ | – | – | – | – |
| Archive/Reopen | ✅ | ✅ | – | ✅ | – | – | – | – |
| Manage members/teams | ✅ | – | – | ✅ | ✅ | – | own org members | – |
| Add participating org | ✅ | – | – | ✅ | – | – | – | – |
| Phases/Locations/Calendar/Numbering | ✅ | – | – | ✅ | ✅ | – | – | – |
| Portfolio/Program admin | ✅ | ✅ | – | – | – | – | – | – |
| Config templates | ✅ | – | – | – | – | – | – | – |
| View audit | ✅ | portfolio | program | own project | own project | – | own org | ✅ |

**Scope hierarchy:** Tenant → Portfolio → Program → Project → Team → Role. Grants cascade down unless overridden; RLS enforces `tenant_id` and project membership; org-data isolation prevents cross-org reads on shared projects.

---

## 9. Reports

| Report | Type | Contents |
|---|---|---|
| Portfolio Health | Executive | per-portfolio: #projects, status mix, on-time %, open-items SLA |
| Program Roll-up | Executive | program KPIs aggregated from child projects |
| Project Register | Operational | all projects w/ filters, phase, dates, members |
| Phase/Gate Status | Operational | phases per project, gate readiness, blocking open items |
| Schedule Adherence | Management | milestone planned vs actual, slippage |
| Team & Access | Security | members/orgs per project, roles, last login |
| Numbering Compliance | Compliance | numbering scheme usage, collisions (=0 target) |
| Setup/Onboarding | Management | setup time, template usage rate |
| Lifecycle History | Audit | status transitions per project |
| Project Audit | Audit | all CUD/membership/phase events w/ actor & diff |

Formats: screen, CSV, XLSX, PDF; scheduled email; permission-scoped; export audited.

---

## 10. Audit
Append-only `audit_logs` (actor, action, resource_type=`project`/child, resource_id, before/after diff, ip, user_agent, correlation_id, ts). Immutable, 7-yr retention, legal-hold aware, exportable. Covers creation → activation → membership/org/phase/location/calendar/numbering/custom-field changes → archive → reopen → (purge under retention).

---

## 11. Testing

### 11.1 Unit
Validators (name/code/dates/acyclic parent/portfolio-program consistency), state-machine legality matrix (all transitions), numbering pattern generation + uniqueness + padding, working-day/SLA engine (incl. GCC Fri/Sat weekend + holidays), location code uniqueness within parent, custom-field validation.

### 11.2 Integration (API+DB)
Create (blank/template/clone) happy paths; clone copies config not data; dup code → 409; stale version → 409; illegal transition → 422; add org/member with role; phase gate blocked by open items → 422; numbering generates sequential unique numbers under concurrency; RLS: org A cannot read org B private data on a shared project; portfolio roll-up aggregation correctness.

### 11.3 UAT
PMO sets up project from template (folders/workflows/numbering/calendar/locations/phases/team) < 15 min; clone to second project; advance phases; archive then reopen; portfolio dashboard reflects child KPIs.

### 11.4 Performance
Project list P95 < 400 ms @ 10k; dashboard roll-up < 1.5 s; numbering counter under 100 concurrent creates (no duplicates); clone of large config within SLA.

### 11.5 Security
AuthZ matrix per role × action; IDOR across tenant/project → 403/404; RLS bypass attempts; numbering race (atomic counter) ; injection/XSS on text; audit immutability; rate-limit. OWASP Top-10.

### 11.6 Regression
Automated suite over all endpoints + state machine + numbering + audit emission; OpenAPI contract tests; data-migration tests on schema changes; CI on every PR.

---

## Implementation roadmap (this module → code)
1. Extend `projects` (portfolio/program/parent/type/dates/calendar/numbering/current_phase/legal_hold) + add supporting tables (migration / `db push`). 2. Status state-machine + archive/reopen + history. 3. Clone. 4. Portfolio/Program + roll-up views. 5. Participating orgs + teams. 6. Phases + gates. 7. Locations (bldg/floor/zone). 8. Calendars + working-day engine. 9. Numbering schemes + atomic counters. 10. Folder/workflow/project templates. 11. Custom fields. 12. Dashboard aggregation. 13. RLS + project-scoped roles. 14. Web: list + wizard + detail tabs + portfolio admin + template admin.

> As-built today: [project.md](project.md). Platform conventions: [../ARCHITECTURE.md](../ARCHITECTURE.md). Sibling spec: [organization-blueprint.md](organization-blueprint.md).
