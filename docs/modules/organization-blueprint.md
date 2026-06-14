# Organization (Client) Module — Enterprise Blueprint

> Implementation-ready specification for the **foundation** module of the CDE platform.
> Audience: BA · Solution/DB/Security Architects · Dev · QA · DevOps · Product.
> Status legend: **[built]** exists in code today · **[partial]** core exists, extension needed · **[proposed]** designed here, not yet built.

## 0. Reality check & gap analysis (read first)

A Fortune-500 review of the *current* implementation against this blueprint:

| Area | Today | Gap to close |
|---|---|---|
| Core entity | `organizations(id, tenant_id, parent_id, name, type, country, created_by, is_deleted, version, ts)` **[built]** | No registration no., legal name, addresses, contacts, status lifecycle, branding, regional settings, custom fields |
| Hierarchy | Self-referencing `parent_id` tree **[built]** | No explicit **Department** entity (sub-org tree is overloaded) |
| Lifecycle | Soft delete only **[built]** | No Active/Inactive/Suspended/Archived state machine + history |
| Participation | Org owns projects via `owner_org_id`; users join via `user_org_memberships` **[partial]** | No **org-on-project participation with per-project role** (an org can be Contractor on P1, Consultant on P2) |
| Branding/Regional | none | Logo, colours, locale, timezone, date/number formats, currency **[proposed]** |
| Extensibility | none | Custom fields / metadata per tenant **[proposed]** |
| Approval | Direct create **[built]** | Optional **maker-checker** approval workflow for org create/activate **[proposed]** |
| Templates | none | Organization templates (pre-filled type/role/branding) **[proposed]** |
| Audit | `audit_logs` append-only on CUD **[built]** | Field-level diff + retention/legal-hold **[partial]** |

**Challenged assumptions / identified gaps**
1. *"Organization == Tenant"* — **No.** A tenant is the billing/data-isolation boundary; an organization is a legal entity *inside* a tenant. One tenant (e.g. the platform owner/operator) onboards many organizations (client, contractors…). This separation must be explicit or cross-org data sharing on shared projects becomes unsafe.
2. *"An org has one role"* — **No.** Role is **per project** (participation), not global. Model it as a relationship, not a column.
3. *"Country is enough for locale"* — **No.** Country ≠ timezone ≠ currency ≠ language. Split regional settings.
4. *Duplicate legal entities* — without registration-number uniqueness, the same contractor gets created 5×. Needs a soft-dedupe rule.
5. *Hard delete* — **forbidden** for a legal entity referenced by contracts/documents. Deactivate/Archive only; deletion is a privacy (GDPR) operation gated by legal hold.

---

## 1. Business Story

### 1.1 Business Vision
Provide a single, authoritative, secure registry of every legal entity collaborating in the built-asset lifecycle, so that identity, access, branding, compliance and commercial relationships are governed once and reused across every project — surpassing Aconex/Procore/ACC where organization setup is rigid, non-configurable, and weakly governed.

### 1.2 Business Objective
- Onboard any participant type (owner, client, contractor, consultant, architect, vendor, supplier, government, FM) in minutes, with governance.
- Guarantee **data ownership**: an organization’s private data stays private even on shared projects.
- Make every attribute **configurable per tenant** (types, fields, branding, regional rules) — nothing hardcoded.

### 1.3 Business Value
- ↓ onboarding time from days (email/PDF forms) to < 10 min self-service + approval.
- ↓ duplicate/incorrect entities → cleaner reporting, fewer mis-deliveries.
- ↑ compliance posture (ISO 19650 information-management roles, ISO 27001 access control, GDPR data ownership).
- Reuse: configure an org once → participate in N projects.

### 1.4 Business Problems
- Org data scattered across spreadsheets/emails; no single source of truth.
- No governance on who can create/activate an org → rogue entities, security risk.
- Branding/regional settings hardcoded → poor experience for multinational clients.
- Cross-company collaboration leaks data due to weak ownership boundaries.

### 1.5 Existing Industry Challenges
- Aconex/ACC: organization directory exists but limited custom fields, weak approval workflow, no per-tenant branding of partner orgs, painful bulk onboarding.
- Procore: company directory strong on US workflows, weaker on multi-region locale/compliance and ISO 19650 role modelling.
- ProjectWise/Thinkproject: powerful but heavy, complex configuration, poor self-service onboarding UX.

### 1.6 Competitor Analysis
| Capability | Aconex | Procore | ACC | ProjectWise | **This CDE (target)** |
|---|---|---|---|---|---|
| Configurable org types | Limited | Limited | Limited | Yes | **Yes (per-tenant)** |
| Custom fields/metadata | No | Partial | Partial | Yes | **Yes** |
| Maker-checker approval | No | No | No | Partial | **Yes (configurable)** |
| Per-project org role | Yes | Yes | Yes | Yes | **Yes** |
| Per-org branding/regional | No | No | Partial | Partial | **Yes** |
| Self-service + governed onboarding | Partial | Partial | Partial | No | **Yes** |
| Data-ownership on shared projects | Partial | Partial | Partial | Yes | **Yes (RLS-ready)** |

### 1.7 Improvements over competitors
Per-tenant configurable everything; maker-checker; org templates; first-class regional/branding; dedupe on registration number; ISO 19650 role tagging; full field-level audit.

### 1.8 User Journey (Tenant Admin onboarding a Contractor)
1. Login → **Admin → Organizations**.
2. *New Organization* (or *From Template*).
3. Enter legal name, type=Contractor, registration no., country/region, addresses, primary contact.
4. (Optional) upload branding (logo/colours), set regional settings, fill custom fields.
5. Submit → if approval enabled, routes to Org-Approver (maker-checker); else Active.
6. Invite the org’s first admin user (becomes org owner-admin).
7. Org now appears in directory; can be added to projects with a role.

### 1.9 End-to-End Process
`Draft → (Pending Approval) → Active → [Suspended ↔ Active] → Inactive → Archived → (Purge under legal/GDPR only)`
Participation: `Org + Project + Role` created when an org joins a project; revoked on removal (membership history retained).

### 1.10 Success Criteria
- Admin can create, configure, approve, activate, and onboard an org with zero code changes.
- Same org participates in ≥2 projects with different roles.
- Private org data never visible to other orgs on a shared project (verified by security test).

### 1.11 KPIs
| KPI | Target |
|---|---|
| Median org onboarding time | < 10 min |
| Duplicate orgs created / quarter | < 1% of creates |
| Org records with complete mandatory profile | > 98% |
| Approval SLA (create→active) | < 4 business hours |
| Access-control violations (org data leak) | 0 |
| Directory search P95 | < 500 ms |

### 1.12 Risks
| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| Duplicate legal entities | Med | Med | Registration-no. uniqueness + fuzzy dedupe warning |
| Privilege misuse (rogue org) | Low | High | Maker-checker approval + audit + RBAC |
| Cross-org data leak on shared project | Low | Critical | Ownership model + Postgres RLS + security tests |
| GDPR deletion vs legal hold conflict | Med | High | Legal-hold flag blocks purge; documented DPA process |
| Over-configuration complexity | Med | Med | Sensible defaults + org templates |

---

## 2. BRD

### 2.1 Scope
- CRUD + lifecycle (draft/active/suspend/deactivate/archive) for organizations.
- Departments (intra-org units). Per-project participation with role.
- Branding, regional settings, custom fields/metadata, registration & compliance attributes.
- User invitation into an org with a role. Optional approval workflow. Org templates.
- Directory: search/filter/sort/export. Full audit, notifications, reports.

### 2.2 Out of Scope
- Project module internals, document storage, billing/subscription, contract management, e-signature, KYC verification integrations (future), payment.

### 2.3 Stakeholders
Tenant Admin, Org Approver, Org Admin (owner-admin of an org), Project Manager, Security/Compliance Officer, End User, Auditor, Platform Operator, DevOps.

### 2.4 Assumptions
- Tenant already exists (created at registration). Identity/RBAC modules operational.
- Email service available for invitations/notifications. Object storage available for logos/registration docs.

### 2.5 Dependencies
Identity & Auth (users, sessions), RBAC/Roles (permissions), Audit, Notification, File storage, Project (participation), Tenant config (feature flags).

### 2.6 Business Rules (BR)
| ID | Rule |
|---|---|
| BR-01 | Every organization belongs to exactly one tenant; `tenant_id` immutable. |
| BR-02 | `legal_name` mandatory; `display_name` defaults to legal name. |
| BR-03 | `registration_number` unique per tenant when provided; soft warning on fuzzy name match. |
| BR-04 | `type` and `status` values come from tenant-configurable code lists, not hardcode. |
| BR-05 | An org cannot be hard-deleted while referenced by any project/document/contract; only Archived. |
| BR-06 | Status transitions follow the state machine; illegal transitions rejected (422). |
| BR-07 | Approval required to move Draft→Active iff tenant feature `org.approval.enabled`. |
| BR-08 | An org may participate in many projects, each with exactly one primary role (additional roles allowed as tags). |
| BR-09 | Suspended org: users cannot act on projects; data remains readable to owners. |
| BR-10 | Custom fields are validated against their field definition (type/required/regex/options). |
| BR-11 | Every create/update/status/membership change is audited with actor, before/after, IP, timestamp. |
| BR-12 | Deleting (GDPR purge) requires no active legal hold and Security Officer approval. |

### 2.7 Functional List
Create, Read/Directory, Update, Status lifecycle (activate/suspend/deactivate/archive), Department mgmt, Project participation mgmt, Invite users, Branding config, Regional config, Custom fields config + capture, Approval workflow, Templates, Bulk import, Export, Audit view, Reports, Notifications.

### 2.8 Non-Functional Requirements
| NFR | Target |
|---|---|
| Performance | Directory list/search P95 < 500 ms @ 100k orgs/tenant |
| Scalability | 10 → 10M orgs across tenants; cursor pagination; indexed search |
| Availability | 99.9%; stateless API; HA Postgres |
| Security | TLS1.3, AES-256 at rest, RBAC + Postgres RLS, OWASP Top-10, field-level encryption for sensitive IDs |
| Privacy | GDPR data ownership, legal hold, right-to-erasure workflow |
| Auditability | Append-only, immutable, field-level diffs, 7-yr retention configurable |
| Configurability | All enums/fields/branding per-tenant; zero redeploy |
| i18n/l10n | UTF-8, RTL support, locale/timezone/currency per org |
| Accessibility | WCAG 2.1 AA |
| Observability | Structured logs, metrics, traces, correlation id |

---

## 3. FRS (Functional Requirements Specification)

> Template applied to each feature. (Workflows in text-arrow form.)

### F-01 Create Organization
- **Purpose:** register a new legal entity in the tenant.
- **Actors:** Tenant Admin, Org Admin (delegated), (Org Approver if approval on).
- **Preconditions:** authenticated; `organization:create`; tenant active.
- **Workflow:** Open form/template → fill mandatory + optional → client+server validate → `POST /organizations` → if approval enabled status=`PENDING_APPROVAL` else `ACTIVE`(or `DRAFT`) → audit `organization.created` → notify approver/creator.
- **Postconditions:** org persisted; appears in directory per status; audit + notification emitted.
- **Validations:** legal_name required; registration_number unique/tenant; type∈configured list; country ISO-3166; email/phone format; logo ≤2MB png/svg.
- **Edge cases:** duplicate registration_number → 409; fuzzy name match → 200 + warning; approval enabled but no approver configured → 422 with guidance; concurrent create same number → unique constraint 409.
- **Acceptance:** Given valid input When submitted Then org created with correct status, audit row, and notification.

### F-02 Edit Organization
- **Purpose:** maintain org attributes. **Actors:** Tenant/Org Admin.
- **Preconditions:** `organization:update`; org not Archived.
- **Workflow:** load → edit → optimistic-lock `version` check → `PATCH` → field-level audit diff.
- **Postconditions:** version++; audit `organization.updated` with diff.
- **Validations:** same as create for changed fields; `tenant_id` immutable; status changes only via lifecycle endpoints.
- **Edge cases:** stale version → 409; editing Archived → 422.
- **Acceptance:** changed fields persisted, diff audited, version incremented.

### F-03 Activate / F-04 Deactivate / F-05 Suspend / F-06 Archive (Lifecycle)
- **Purpose:** govern operational state. **Actors:** Tenant Admin / Org Approver / Security Officer (archive).
- **Workflow:** `POST /organizations/{id}/{activate|suspend|deactivate|archive}` → validate transition via state machine → set status + `status_changed_at/by` → write `organization_status_history` → audit → notify org admins.
- **Preconditions:** corresponding permission; legal transition.
- **Postconditions:** new status; history row; downstream access recomputed (suspended ⇒ users blocked on projects).
- **Edge cases:** illegal transition (e.g., Archived→Active) → 422; suspend org with in-flight approvals → allowed, actions blocked.
- **Acceptance:** only legal transitions succeed; history + audit present.

### F-07 Invite Users
- **Purpose:** add people to an org with a role. **Actors:** Tenant/Org Admin.
- **Workflow:** enter email+role(+department) → create invitation (token, expiry) → email → invitee accepts → user created/linked + `user_org_membership` → audit.
- **Validations:** email format; role∈tenant roles; not already a member; invite expiry (default 7d, configurable).
- **Edge cases:** re-invite pending → resend, no duplicate; expired token → 410; email already a member → 409.
- **Acceptance:** invitee becomes member with the assigned role; audit `user.invited`/`user.membership.assigned`.

### F-08 Configure Branding
- **Purpose:** per-org logo, primary/secondary colour, email header.
- **Workflow:** upload logo (presigned) → set colours (hex) → preview → save `organization_branding`.
- **Validations:** logo mime/size; hex `^#([0-9a-fA-F]{6})$`.
- **Edge cases:** invalid image → 422; revert to tenant default.
- **Acceptance:** branding applied in org-scoped UI/email; audited.

### F-09 Configure Regional Settings
- **Purpose:** locale, timezone, date/number format, currency, first-day-of-week, RTL.
- **Validations:** locale BCP-47; timezone IANA; currency ISO-4217.
- **Acceptance:** dates/numbers/currency render per org settings; audited.

### F-10 Custom Metadata / F-11 Custom Fields
- **Purpose:** tenant-defined attributes on orgs.
- **Workflow (config):** Admin defines field (key, label, type, required, options, regex, scope) → stored in `organization_custom_fields`. **(capture):** values validated + saved to `organization_custom_field_values`.
- **Edge cases:** delete field with values → soft-disable, retain values; type change → versioned.
- **Acceptance:** custom fields render in UI, validate, persist, export, audit.

### F-12 Approval Workflow
- **Purpose:** maker-checker for org create/activate. **Actors:** Maker (creator), Checker (Org Approver).
- **Workflow:** create→`PENDING_APPROVAL`→approver `approve`/`reject(reason)`→Active/Draft(rejected)→notify maker.
- **Validations:** approver ≠ maker (configurable SoD); reason required on reject.
- **Edge cases:** no approver, approver inactive, SLA breach → escalate.
- **Acceptance:** org only Active after approval when feature on; full audit trail.

### F-13 Organization Templates
- **Purpose:** speed onboarding with pre-filled defaults (type, role, branding, custom-field defaults, regional).
- **Workflow:** Admin creates template → *New from Template* prefills form.
- **Acceptance:** creating from template yields identical defaults; template changes don’t mutate existing orgs.

### F-14 Project Participation (org-on-project role)
- **Purpose:** an org joins a project with a primary role (Contractor/Consultant/...).
- **Workflow:** from project → add org + role → `organization_project_roles` row → audit → notify org admin.
- **Edge cases:** org suspended/archived cannot be added; removing participation retains history.
- **Acceptance:** same org has different roles across projects; access scoped accordingly.

### F-15 Bulk Import / F-16 Export
- Import CSV/XLSX with row-level validation report; export directory (CSV/XLSX/PDF) honoring filters & permissions.

---

## 4. User Stories

> Format: As/Want/So that · AC · Business Rules · Exceptions · Points · Priority. (MoSCoW)

| ID | Story (As a … I want … so that …) | Key AC | Pts | Pri |
|---|---|---|---|---|
| US-01 | As a **Tenant Admin** I want to **create an organization** so that a new entity can collaborate. | Mandatory validation; status per approval flag; audit+notify | 5 | Must |
| US-02 | As a **Tenant Admin** I want to **edit an organization** so that its details stay accurate. | Optimistic lock; field-level audit diff | 3 | Must |
| US-03 | As an **Org Approver** I want to **approve/reject** new orgs so that only governed entities go live. | Approve→Active; Reject(reason)→Draft; SoD enforced | 5 | Must |
| US-04 | As a **Tenant Admin** I want to **archive** an org so that obsolete entities leave active use without data loss. | Archived blocks edits; referenced data intact | 3 | Must |
| US-05 | As a **Tenant Admin** I want to **activate** a draft/suspended org. | Legal transition only; history row | 2 | Must |
| US-06 | As a **Tenant Admin** I want to **deactivate** an org so that it can no longer act. | Users blocked; readable to owners | 3 | Must |
| US-07 | As a **Security Officer** I want to **suspend** an org immediately so that risk is contained. | Instant block; audit; reason | 3 | Should |
| US-08 | As an **Org Admin** I want to **invite users** with roles so that my team can work. | Tokenized email; accept→membership | 5 | Must |
| US-09 | As an **Org Admin** I want to **configure branding** so that the org is recognizable. | Logo+colours; preview; default fallback | 5 | Should |
| US-10 | As an **Org Admin** I want to **set regional settings** so that locale/format/currency are correct. | BCP-47/IANA/ISO-4217 validation | 3 | Should |
| US-11 | As a **Tenant Admin** I want to **define custom fields** so that org-specific data is captured without code. | Field types/validation; render in UI | 8 | Should |
| US-12 | As a **Tenant Admin** I want to **capture custom field values** so that records are complete. | Validation per definition; export | 3 | Should |
| US-13 | As a **Tenant Admin** I want an **approval workflow** so that org onboarding is governed. | Maker-checker; SoD; SLA escalation | 8 | Should |
| US-14 | As a **Tenant Admin** I want **org templates** so onboarding is fast and consistent. | Prefill; no retro-mutation | 5 | Could |
| US-15 | As a **Project Manager** I want to **add an org to a project with a role** so that responsibilities are clear. | Per-project role; suspended orgs blocked | 5 | Must |
| US-16 | As a **Tenant Admin** I want to **bulk import** orgs so onboarding scales. | Row validation report; partial success | 8 | Could |
| US-17 | As an **Auditor** I want to **view the audit trail** so that I can prove compliance. | Immutable, field-level, filterable | 5 | Must |
| US-18 | As a **Tenant Admin** I want to **search/filter/sort/export** the directory. | Indexed search; permissions honored | 5 | Must |

**Exceptions (common):** unauthorized→403; validation→400; conflict (dup/version)→409; illegal transition→422; expired invite→410.

---

## 5. UI Documentation

### 5.1 Screens
1. **Organization Directory** (`/organizations`) — grid + toolbar.
   - Toolbar: Search box (name/registration no.), Filters (type, status, country, department), Sort, **+ New Organization**, **From Template**, Export, Columns chooser.
   - Grid columns: Logo, Legal Name, Display Name, Type (pill), Status (pill), Country, #Projects, #Users, Updated. Row actions: View, Edit, Lifecycle ▸, Audit.
   - Empty state: “No organisations yet — create the first one.” Pagination: cursor (Load more / infinite).
   - Responsive: ≥1024px grid; <768px card list. A11y: table semantics, keyboard nav, ARIA on pills.
2. **Organization Detail / Profile** (`/organizations/{id}`) — tabs:
   - **Overview** (legal/display name, type, status, registration, incorporation date, website, parent, description).
   - **Addresses & Contacts** (registered, billing, site addresses; primary/secondary contacts).
   - **Branding** (logo upload, primary/secondary colour pickers, email header preview).
   - **Regional** (locale, timezone, date/number format, currency, first day of week, RTL).
   - **Custom Fields** (dynamic form from field definitions).
   - **Departments** (tree/list CRUD).
   - **Users** (members grid + Invite).
   - **Projects** (participation grid: project, role, joined, status).
   - **Audit** (timeline of changes).
3. **Create/Edit Organization** — wizard (Step 1 Identity → 2 Address/Contact → 3 Regional/Branding → 4 Custom fields → 5 Review/Submit). Inline validation, autosave draft.
4. **Invite User dialog** — email, role (select), department (optional), message; Send.
5. **Approval queue** (`/admin/approvals`) — pending orgs; Approve / Reject(reason).
6. **Custom Field Admin** (`/admin/custom-fields`) — define fields.
7. **Template Admin** (`/admin/org-templates`).
8. **Bulk Import** — upload, mapping, validation report, commit.

### 5.2 Field/Control inventory (Create wizard, Step 1 — Identity)
| Field | Control | Required | Validation | Searchable | Filterable | Sortable |
|---|---|---|---|---|---|---|
| Legal name | text | Yes | 2–200 chars | Yes | No | Yes |
| Display name | text | No (defaults) | ≤200 | Yes | No | Yes |
| Type | select (config list) | Yes | in list | No | Yes | Yes |
| Registration no. | text | No | unique/tenant | Yes | No | No |
| Tax/VAT no. | text (masked) | No | regex per country | No | No | No |
| Incorporation date | date | No | ≤ today | No | Yes | Yes |
| Country | select ISO-3166 | Yes | in list | No | Yes | Yes |
| Website | url | No | URL | No | No | No |
| Parent org | autocomplete | No | same tenant, no cycle | No | Yes | No |
| Description | textarea | No | ≤2000 | Yes | No | No |

### 5.3 Buttons/States
Primary (Save/Submit), Secondary (Cancel), Destructive (Archive — confirm modal w/ type-to-confirm). Disabled states: Save disabled until valid; lifecycle buttons reflect legal transitions only. Loading skeletons on grids; toast on success; problem-detail error banner on failure.

### 5.4 Accessibility
WCAG 2.1 AA: 4.5:1 contrast, focus rings, ARIA labels, keyboard operable, screen-reader announcements on async actions, RTL mirroring when org locale is RTL.

---

## 6. Database Design

> Postgres 18. Conventions: UUID v4 PKs, `tenant_id` on tenant-scoped tables, `created_at/updated_at/created_by`, `is_deleted` + `version` on primary entities, snake_case columns, RLS-ready. Cross-module references are scalar IDs (no cross-schema FK), per platform architecture.

### 6.1 Table: `organizations` (primary)
Purpose: master legal-entity record. Relationships: 1—N departments, addresses, contacts, custom-field values, status history, project-roles, memberships; self-ref `parent_id`. PK `id`. Soft delete `is_deleted`. Versioned `version`. Audited. Partition: by `tenant_id` (hash) at scale. Replication: streaming + PITR.

| Column | Type | Len | Null | Default | Validation | Meaning | Example | UI | Srch | Filt | Sort | Idx | Enc | Aud | API name | Roles | Why |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| id | uuid | – | N | gen | – | PK | `a1b2…` | – | N | N | N | PK | N | Y | id | all | identity |
| tenant_id | uuid | – | N | – | FK tenant | isolation boundary | – | hidden | N | Y | N | Y | N | Y | tenantId | system | multi-tenancy |
| legal_name | varchar | 200 | N | – | 2–200 | registered legal name | "Acme Civil LLC" | text | Y | N | Y | Y(GIN trgm) | N | Y | legalName | org:read | identity |
| display_name | varchar | 200 | Y | =legal | ≤200 | UI name | "Acme Civil" | text | Y | N | Y | Y | N | Y | displayName | org:read | UX |
| type | varchar | 40 | N | – | in code list | participant type | "CONTRACTOR" | select | N | Y | Y | Y | N | Y | type | org:read | classification |
| status | varchar | 30 | N | 'DRAFT' | state machine | lifecycle state | "ACTIVE" | pill | N | Y | Y | Y | N | Y | status | org:read | governance |
| registration_number | varchar | 80 | Y | – | unique/tenant | company reg no. | "CN-12345" | text | Y | N | N | Y(uniq partial) | N | Y | registrationNumber | org:read | dedupe/compliance |
| tax_number | varchar | 60 | Y | – | regex/country | VAT/Tax id | "AE100…" | masked | N | N | N | N | **Y** | Y | taxNumber | org:admin | finance/compliance |
| incorporation_date | date | – | Y | – | ≤today | founding date | 2009-04-01 | date | N | Y | Y | N | N | Y | incorporationDate | org:read | compliance |
| country | char | 2 | N | – | ISO-3166 | HQ country | "AE" | select | N | Y | Y | Y | N | Y | country | org:read | locale/compliance |
| website | varchar | 255 | Y | – | URL | site | – | url | N | N | N | N | N | Y | website | org:read | contactability |
| parent_id | uuid | – | Y | – | same tenant, acyclic | group hierarchy | – | autocomplete | N | Y | N | Y | N | Y | parentId | org:read | corporate groups |
| description | text | – | Y | – | ≤2000 | notes | – | textarea | Y | N | N | N | N | Y | description | org:read | context |
| created_by | uuid | – | Y | – | – | creator | – | hidden | N | N | N | Y | N | Y | createdBy | system | accountability |
| status_changed_by | uuid | – | Y | – | – | last lifecycle actor | – | hidden | N | N | N | N | N | Y | statusChangedBy | system | governance |
| status_changed_at | timestamptz | – | Y | – | – | last transition time | – | hidden | N | Y | Y | Y | N | Y | statusChangedAt | system | governance |
| is_deleted | bool | – | N | false | – | soft delete | false | hidden | N | Y | N | Y | N | Y | isDeleted | system | retention |
| legal_hold | bool | – | N | false | – | blocks purge | false | toggle | N | Y | N | N | N | Y | legalHold | security | GDPR/legal |
| version | int | – | N | 1 | – | optimistic lock | 1 | hidden | N | N | N | N | N | Y | version | system | concurrency |
| created_at | timestamptz | – | N | now() | – | created | – | – | N | Y | Y | Y | N | Y | createdAt | all | audit |
| updated_at | timestamptz | – | N | now() | – | updated | – | – | N | Y | Y | Y | N | Y | updatedAt | all | audit |

Indexes: PK(id); `uniq(tenant_id, registration_number) where registration_number is not null`; `(tenant_id, status, is_deleted)`; `(tenant_id, type)`; GIN trigram on `legal_name`,`display_name` for search; `(parent_id)`. Constraints: `chk_status in (...)`, `chk_type in tenant list` (app-enforced), `fk_parent` same-tenant via trigger.

### 6.2 Supporting tables (purpose · key columns)
| Table | Purpose | Key columns |
|---|---|---|
| `organization_addresses` | multiple typed addresses | id, organization_id, type(registered/billing/site), line1, line2, city, state, postal_code, country, is_primary |
| `organization_contacts` | contact persons | id, organization_id, name, title, email, phone, type(primary/secondary/finance), is_primary |
| `organization_branding` | per-org branding | organization_id(PK), logo_file_key, primary_color, secondary_color, email_header |
| `organization_regional_settings` | locale/format | organization_id(PK), locale, timezone, date_format, number_format, currency, first_day_of_week, rtl |
| `organization_custom_fields` | tenant field defs | id, tenant_id, key, label, data_type, required, options(jsonb), regex, sort, is_active |
| `organization_custom_field_values` | values | id, organization_id, field_id, value(jsonb) ; uniq(organization_id, field_id) |
| `departments` | intra-org units | id, tenant_id, organization_id, parent_id, name, code, is_deleted |
| `organization_project_roles` | participation | id, tenant_id, organization_id, project_id, role, joined_at, status ; uniq(organization_id, project_id) |
| `organization_status_history` | lifecycle audit | id, organization_id, from_status, to_status, reason, changed_by, changed_at |
| `organization_invitations` | user invites | id, tenant_id, organization_id, email, role_id, department_id, token_hash, status, expires_at, invited_by |
| `organization_documents` | registration/compliance docs | id, organization_id, doc_type, file_key, expiry_date, uploaded_by |
| `organization_templates` | onboarding templates | id, tenant_id, name, defaults(jsonb) |
| `organization_approvals` | maker-checker | id, organization_id, state, maker_id, checker_id, reason, decided_at |

(Each supporting table: same audit/soft-delete conventions where it holds primary data; child tables cascade on org archive but never hard-delete under legal hold.)

### 6.3 Data governance
Field-level encryption for `tax_number` (pgcrypto/KMS). Partitioning by `tenant_id` hash at >5M rows. Read replicas for directory/reporting. PITR + daily snapshots. Retention: audit 7y (configurable); purge only via GDPR workflow when `legal_hold=false`.

---

## 7. APIs

Base `/v1`. Auth: Bearer JWT (tenant context from token). Errors: RFC 7807. Idempotency-Key on POST. Cursor pagination.

| Route | Method | Auth/Perm | Request (key) | Success | Errors | Audit event |
|---|---|---|---|---|---|---|
| `/organizations` | GET | `organization:read` | `?filter[type|status|country]=&q=&cursor=&limit=&sort=` | 200 `{items,total,nextCursor}` | 401/403 | – |
| `/organizations` | POST | `organization:create` | legalName,type,country,registrationNumber?,addresses?,regional?,customFields? | 201 org | 400/403/409/422 | organization.created |
| `/organizations/{id}` | GET | `organization:read` | – | 200 org(+expansions) | 401/403/404 | – |
| `/organizations/{id}` | PATCH | `organization:update` | partial + `version` | 200 org | 400/403/404/409 | organization.updated |
| `/organizations/{id}/activate` | POST | `organization:activate` | – | 200 | 403/404/422 | organization.activated |
| `/organizations/{id}/suspend` | POST | `organization:suspend` | reason | 200 | 403/404/422 | organization.suspended |
| `/organizations/{id}/deactivate` | POST | `organization:update` | reason | 200 | 403/404/422 | organization.deactivated |
| `/organizations/{id}/archive` | POST | `organization:archive` | reason | 200 | 403/404/422 | organization.archived |
| `/organizations/{id}/approve` | POST | `organization:approve` | – | 200 | 403/404/422 | organization.approved |
| `/organizations/{id}/reject` | POST | `organization:approve` | reason | 200 | 403/404/422 | organization.rejected |
| `/organizations/{id}/branding` | PUT | `organization:update` | logoFileKey,colors | 200 | 400/403/404 | organization.branding.updated |
| `/organizations/{id}/regional` | PUT | `organization:update` | locale,timezone,currency,… | 200 | 400/403/404 | organization.regional.updated |
| `/organizations/{id}/departments` | GET/POST | `organization:read`/`update` | name,code,parentId | 200/201 | 4xx | department.* |
| `/organizations/{id}/contacts` `/addresses` | GET/POST/PATCH/DELETE | read/update | typed payloads | 2xx | 4xx | organization.contact/address.* |
| `/organizations/{id}/invitations` | POST | `user:manage` | email,roleId,departmentId? | 201 | 400/403/409 | user.invited |
| `/organizations/{id}/custom-field-values` | PUT | `organization:update` | values[] | 200 | 400/422 | organization.customfields.updated |
| `/organizations/{id}/project-roles` | GET/POST/DELETE | `organization:read`/`project:member:manage` | projectId,role | 2xx | 4xx | organization.participation.* |
| `/organizations/{id}/audit` | GET | `audit:read` | filters | 200 | 403 | – |
| `/organizations/import` | POST | `organization:create` | file | 202 jobId | 400 | organization.bulk_imported |
| `/organizations/export` | GET | `organization:read` | format,filters | 200 file | 403 | organization.exported |
| `/admin/org-custom-fields` | GET/POST/PATCH | `org-config:manage` | field def | 2xx | 4xx | org_custom_field.* |
| `/admin/org-templates` | GET/POST/PATCH | `org-config:manage` | template | 2xx | 4xx | org_template.* |

Standard error codes: 400 VALIDATION_ERROR, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 410 GONE (expired invite), 422 UNPROCESSABLE (illegal transition/business rule), 429 RATE_LIMITED.

---

## 8. Permission Matrix

Permissions: `organization:{read,create,update,activate,suspend,archive,approve}`, `org-config:manage`, `user:manage`, `audit:read`, `project:member:manage`. `*` = superuser.

| Action / Role | Tenant Admin (`*`) | Org Approver | Org Admin | Project Manager | Member | Security Officer | Auditor |
|---|---|---|---|---|---|---|---|
| View directory | ✅ | ✅ | own org(s) | project orgs | own org | ✅ | ✅ |
| Create org | ✅ | – | – | – | – | – | – |
| Edit org | ✅ | – | own org | – | – | – | – |
| Approve/Reject | ✅ | ✅ | – | – | – | – | – |
| Activate/Deactivate | ✅ | ✅ | – | – | – | – | – |
| Suspend | ✅ | – | – | – | – | ✅ | – |
| Archive | ✅ | – | – | – | – | ✅ | – |
| Branding/Regional | ✅ | – | own org | – | – | – | – |
| Define custom fields | ✅ | – | – | – | – | – | – |
| Invite users | ✅ | – | own org | – | – | – | – |
| Add org to project | ✅ | – | – | ✅ | – | – | – |
| View audit | ✅ | – | own org | – | – | ✅ | ✅ |

**Scope hierarchy of permissions:** Tenant → Organization → Department → Project → Folder → Document. A grant at a higher scope cascades down unless explicitly overridden; RLS enforces `tenant_id`, and organization-data ownership prevents cross-org read on shared projects.

---

## 9. Notifications

| Event | Channels | Recipients | Template (subject) | Retry |
|---|---|---|---|---|
| org.created (approval on) | Email, In-App | Org Approver(s) | “Approval needed: {legalName}” | 3× exp backoff |
| org.approved / rejected | Email, In-App | Maker (creator) | “Organization {name} {decision}” | 3× |
| org.activated/suspended/archived | Email, In-App, (SMS for suspend) | Org Admins, Security | “Organization {name} is now {status}” | 3× |
| user.invited | Email | Invitee | “You’re invited to {orgName}” (tokenized link) | 3×, resend allowed |
| invitation.expiring | Email | Invitee | “Your invite expires in 24h” | 1× |
| registration.doc.expiring | Email, In-App | Org Admin | “{docType} expires on {date}” | daily until renewed |
| approval.sla.breached | In-App, Email | Approver + manager (escalation) | “Approval overdue: {name}” | until actioned |

Delivery: queue-based (SQS/SNS or Redis), idempotent by event id, DLQ after max retries, per-tenant template overrides, per-user channel preferences, quiet hours, audit of sends.

---

## 10. Reports

| Report | Type | Contents | Audience |
|---|---|---|---|
| Organization Directory | Operational | all orgs w/ filters, status, #projects/#users | Admin/PM |
| Onboarding Funnel | Management | created→pending→active→rejected, cycle time, SLA | Product/Ops |
| Participation Matrix | Operational | org × project × role | PM |
| Incomplete Profiles | Compliance | orgs missing mandatory/custom fields | Compliance |
| Registration/Doc Expiry | Compliance | docs expiring in N days | Compliance/Admin |
| Approval Audit | Audit | who approved/rejected, reasons, timing | Auditor |
| Access/Role Report | Security | users per org/role, last login | Security |
| Data Ownership / Sharing | Security | which orgs share which projects | Security |
| Lifecycle History | Audit | status transitions per org | Auditor |

Formats: on-screen, CSV, XLSX, PDF; scheduled email delivery; permission-scoped; export audited.

---

## 11. Audit (auditable actions — creation → deletion)

Append-only `audit_logs` (actor, action, resource_type=`organization`/child, resource_id, before/after diff (jsonb), ip, user_agent, correlation_id, timestamp). Immutable, retained 7y (configurable), exportable, legal-hold aware.

Events: `organization.created/updated/activated/suspended/deactivated/archived/approved/rejected`, `organization.branding.updated`, `organization.regional.updated`, `organization.customfields.updated`, `organization.address/contact.created/updated/deleted`, `department.created/updated/deleted`, `organization.participation.added/removed`, `user.invited/membership.assigned/revoked`, `organization.exported/bulk_imported`, `organization.legal_hold.set/cleared`, `organization.purged` (GDPR). Every event records before/after for changed fields.

---

## 12. Testing

### 12.1 Unit
- Validators: legal_name length, registration uniqueness, ISO country/locale/currency/timezone, hex colour, version conflict, state-machine legality (all transitions matrix), custom-field validation per type, SoD (approver≠maker).

### 12.2 Integration (API + DB)
- Create→approval→activate happy path; reject path; edit with stale version→409; duplicate registration→409; lifecycle illegal transition→422; invite→accept→membership; branding/regional persistence; custom-field define→capture→export; participation across 2 projects with different roles; RLS: org A cannot read org B private data on shared project.

### 12.3 UAT (scenario)
- Admin onboards a Contractor end-to-end (incl. branding, regional, custom fields, invite); PM adds it to a project as Contractor; same org added to another project as Consultant; suspend blocks user actions; archive preserves referenced documents.

### 12.4 Performance
- Directory P95 < 500 ms @ 100k orgs; search (trigram) under load; bulk import 50k rows within SLA; pagination stability.

### 12.5 Security
- AuthZ matrix enforcement (per role × action); IDOR (access other tenant/org by id)→403/404; injection (SQL/XSS) on text fields; sensitive field encryption (tax_number) at rest; audit immutability; RLS bypass attempts; rate-limit; secrets handling. OWASP Top-10 checklist.

### 12.6 Regression
- Automated suite covering all endpoints + state machine + audit emission; run in CI on every PR; contract tests against OpenAPI; data-migration tests for schema changes.

---

## Implementation roadmap (this module → code)
1. Extend `organizations` table + add supporting tables (migration). 2. Status state-machine service + lifecycle endpoints. 3. Branding/regional/custom-fields. 4. Approval (maker-checker) behind tenant feature flag. 5. Participation (`organization_project_roles`). 6. Invitations. 7. Templates + bulk import/export. 8. Reports + notification templates. 9. RLS policies + field encryption. 10. Web: directory + profile tabs + wizard + approval queue + admin config.

> See [organization.md](organization.md) for the **as-built** endpoints today, and [../ARCHITECTURE.md](../ARCHITECTURE.md) for platform conventions this blueprint conforms to.
