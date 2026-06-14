# Project Module

**Spec:** §2 Project, §3.3 · **Status:** ✅ running
**Code:** `apps/api/src/modules/project/`

## Purpose
The project is the top-level container every domain record hangs off. Manages project lifecycle, team membership, and a dashboard summary.

## Endpoints
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/v1/projects` | `project:read` | List projects (with member counts) |
| POST | `/v1/projects` | `project:create` | Create project (creator auto-added as member) |
| GET | `/v1/projects/{id}` | `project:read` | Get project |
| PATCH | `/v1/projects/{id}` | `project:update` | Update (bumps `version`) |
| DELETE | `/v1/projects/{id}` | `project:update` | Archive (soft delete + status ARCHIVED) |
| GET | `/v1/projects/{id}/members` | `project:read` | List members (user + project role) |
| POST | `/v1/projects/{id}/members` | `project:member:manage` | Assign user to project with a role |
| PATCH | `/v1/projects/{id}/members/{userId}` | `project:member:manage` | Change a member's project role |
| DELETE | `/v1/projects/{id}/members/{userId}` | `project:member:manage` | Remove a member |
| GET | `/v1/projects/{id}/dashboard` | `project:read` | Summary counters |

## Data model
- `projects` — `id, tenant_id, name, code, status, start_date, end_date, owner_org_id, created_by, is_deleted, version` (unique `[tenant_id, code]`)
- `project_members` — `id, project_id, user_id, organization_id, role_id, invited_by, accepted_at` (unique `[project_id, user_id]`)

## Lifecycle & business rules
- `status` ∈ PLANNING | ACTIVE | ON_HOLD | COMPLETED | ARCHIVED.
- `code` is unique per tenant; duplicates → 409 CONFLICT. Validated `[A-Za-z0-9._-]`.
- Creating a project and adding the creator as the first member happens in one transaction.
- Adding a member validates the target user belongs to the same tenant (else 422).

## Permissions
`project:read` / `project:create` / `project:update` / `project:member:manage`.

## Pending / next
- Project **milestones, templates, calendars** (in spec data model, not yet built).
- Dashboard counters currently include members + zeros; wire document/RFI/snag/approval counts (aggregate per project).
- Per-member project roles & invitations (accept flow).
