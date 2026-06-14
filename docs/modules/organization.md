# Organization Module

**Spec:** §2 Organization, §4 · **Status:** ✅ running
**Code:** `apps/api/src/modules/organization/`

## Purpose
Company hierarchy within a tenant — the parties (client, consultant, contractor, subcontractor, supplier) that collaborate on projects.

## Endpoints
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/v1/organizations` | bearer | List tenant organisations |
| POST | `/v1/organizations` | `organization:create` | Create organisation |
| GET | `/v1/organizations/{id}` | bearer | Get organisation |
| PATCH | `/v1/organizations/{id}` | `organization:create` | Update (bumps `version`) |
| DELETE | `/v1/organizations/{id}` | `organization:create` | Soft delete |

## Data model
`organizations` — `id, tenant_id, parent_id, name, type, country, created_by, is_deleted, version, timestamps`
- Self-referencing `parent_id` → organisation tree (sub-organisations).
- `type` ∈ CLIENT | CONSULTANT | CONTRACTOR | SUBCONTRACTOR | SUPPLIER | OTHER.

## Lifecycle & business rules
- Soft delete (`is_deleted`); excluded from listings.
- Optimistic locking via `version`.
- All queries scoped to caller's `tenant_id`.

## Permissions
`organization:create` (held by Tenant Admin `*` and Project Manager) gates all mutations; reads are open to any authenticated tenant user.

## Pending / next
- Contacts under an organisation; invitations; organisation-level branding/config.
- Distinct `organization:update` / `organization:delete` permissions (currently reuse `:create`).
