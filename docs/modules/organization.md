# Organization Module

**Spec:** §2 Organization, §4 · **Status:** ✅ running
**Code:** `apps/api/src/modules/organization/`

## Purpose
Company hierarchy within a tenant — the parties (client, consultant, contractor, subcontractor, supplier) that collaborate on projects.

## Endpoints
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/v1/organizations` | bearer | List tenant organisations |
| POST | `/v1/organizations` | **super admin (`*`)** | Create organisation (see fields below) |
| GET | `/v1/organizations/{id}` | bearer | Get organisation |
| PATCH | `/v1/organizations/{id}` | `organization:create` | Update (bumps `version`) |
| DELETE | `/v1/organizations/{id}` | `organization:create` | Soft delete |

## Data model
`organizations` — core: `id, tenant_id, parent_id, name, type, status, created_by, is_deleted, version, timestamps`
- Registration/compliance: `registration_number` (unique per tenant), `tax_number`, `incorporation_date`, `website`.
- Address: `address_line1/2, city, state, postal_code, country`.
- Primary contact: `phone, contact_name, contact_email, contact_phone`.
- Self-referencing `parent_id` → organisation tree (sub-organisations).
- `type` ∈ CLIENT | CONSULTANT | CONTRACTOR | SUBCONTRACTOR | SUPPLIER | OTHER. `status` ∈ ACTIVE | INACTIVE | SUSPENDED | ARCHIVED.

## Business rules (as built)
- **Only a super admin** (holder of `*`) can create an organisation (`requireSuperAdmin`). Non-admins → 403.
- `registration_number` is unique per tenant → duplicate creation returns 409 CONFLICT.

## Lifecycle & business rules
- Soft delete (`is_deleted`); excluded from listings.
- Optimistic locking via `version`.
- All queries scoped to caller's `tenant_id`.

## Permissions
`organization:create` (held by Tenant Admin `*` and Project Manager) gates all mutations; reads are open to any authenticated tenant user.

## Pending / next
- Contacts under an organisation; invitations; organisation-level branding/config.
- Distinct `organization:update` / `organization:delete` permissions (currently reuse `:create`).
