# User Management Module (Admin Provisioning)

**Spec:** §2 Identity / Admin Portal — user provisioning · **Status:** ✅ running
**Code:** `apps/api/src/modules/user/`, web `apps/web/app/users/`

## Purpose
Lets a **Tenant Admin** provision people: create user accounts, assign each to an organisation with a role, update profile/status, and deactivate. This is the intended entry flow — an admin sets up **organisations → users → projects** (self-service tenant registration creates only the first admin).

## Endpoints
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/v1/users` | `user:read` | List tenant users (with org + role) |
| POST | `/v1/users` | `user:manage` | Create user + assign org + role |
| GET | `/v1/users/{id}` | `user:read` | Get user |
| PATCH | `/v1/users/{id}` | `user:manage` | Update name / status / password |
| POST | `/v1/users/{id}/memberships` | `user:manage` | **Reassign** organisation + role (replaces existing — single primary membership) |
| DELETE | `/v1/users/{id}` | `user:manage` | Deactivate (status → DISABLED; never hard-deleted) |

## Business rules
- Email is unique per tenant (409 on duplicate).
- The target organisation and role must belong to the caller's tenant (422 otherwise).
- You cannot deactivate your own account.
- Passwords are scrypt-hashed; never returned. Membership upsert means re-assigning an org updates the role.

## Permissions
`user:read` / `user:manage` — held by **Tenant Admin** (`*`). Grant explicitly to other roles to delegate user administration.

## Web
`/users` — list + "New User" modal (name, email, temp password, organisation dropdown, role dropdown) + deactivate. Guards against creating users before an organisation exists. Sidebar **Admin** section also links **Organizations** and **Projects**.

## Pending / next
- Email **invitations** (INVITED status) instead of admin-set passwords.
- Multiple memberships per user across organisations; per-project roles.
- Bulk import (CSV) per the migration spec.
