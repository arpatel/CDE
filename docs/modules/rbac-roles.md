# RBAC / Roles Module

**Spec:** §1.4, §4 · **Status:** ✅ running
**Code:** `apps/api/src/modules/role/`, `src/middleware/authenticate.ts`

## Purpose
Named permission sets (roles) and the permission-guard that authorises every mutation. Role-based access control with tenant-defined custom roles plus protected system roles.

## Endpoints
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/v1/roles` | `role:read` | List roles |
| POST | `/v1/roles` | `role:manage` | Create custom role |
| PATCH | `/v1/roles/{id}` | `role:manage` | Update (system roles rejected) |
| DELETE | `/v1/roles/{id}` | `role:manage` | Delete (system roles rejected) |

## Data model
`roles` — `id, tenant_id, name, description, is_system, permissions (jsonb string[]), timestamps` (unique `[tenant_id, name]`)
`user_org_memberships` — links `user_id` ↔ `organization_id` with a `role_id`.

## Permission model
- Permissions are strings `"<module>:<action>"` (e.g. `project:create`, `rfi:update`). `"*"` = all.
- A user's **effective permissions** = union of role permissions across their org memberships, resolved per request.
- Guard: `requirePermission("a","b")` passes if the set contains `"*"` or every listed permission.

## System roles (auto-provisioned per tenant on registration)
| Role | Permissions |
|---|---|
| **Tenant Admin** | `*` |
| **Project Manager** | project:read/create/update, project:member:manage, organization:read/create, role:read |
| **Member** | project:read, organization:read |

System roles (`is_system = true`) cannot be edited or deleted.

## Pending / next
- Project-scoped roles (member role per project) and **ABAC** conditions.
- Seed domain permissions (document/rfi/snag/…) onto PM/Member roles — today only Tenant Admin (`*`) exercises domain modules.
- Permission catalogue endpoint + Redis caching of resolved sets.
