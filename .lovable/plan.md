# Worker roles & per-role permissions

Add to Settings → Workers so admins can assign Manager vs Cashier roles, plus a new Roles & Permissions screen to toggle individual capabilities per role.

## 1. Database

New table `role_permissions` storing one row per (role, permission_key):

- `role` — app_role enum (manager, cashier)
- `permission_key` — text, e.g. `services.edit`, `reports.view`, `customers.edit`, `memberships.manage`, `pos.refund`, `pos.use`, `giftcards.sell`, `workers.clock`, etc.
- `allowed` — boolean

Seed sensible defaults (Manager gets most, Cashier gets POS-only).

RLS:
- Read: all authenticated users (each user needs to know their own permissions).
- Write: super_admin + admin only.

Plus a SECURITY DEFINER helper `has_permission(_user_id uuid, _key text)` that returns true if the user is super_admin/admin (always allowed) OR any of their roles has `allowed=true` for that key. Use it later if we want to harden RLS per-permission; not required for v1.

Data preservation: all changes are additive (new table only). No existing row is touched.

## 2. Server functions (`src/lib/worker-auth.functions.ts`)

Add admin-gated server functions:

- `setWorkerRole({ workerId, role: 'manager' | 'cashier' })` — replaces non-admin roles in `user_roles` for that user with the chosen role (never touches super_admin/admin rows).
- `listWorkerRoles()` — returns `{ user_id, role }[]` so the Workers table can show each person's role.
- `setRolePermissions({ role, permissions: Record<string, boolean> })` — upserts toggles into `role_permissions`.
- `listRolePermissions()` — returns current toggles for manager + cashier.

All gated by `has_any_role(super_admin, admin)`.

## 3. UI — Settings page

**Workers tab**
- Add a "Role" column to the workers table showing `Manager` / `Cashier` badge.
- Add a `Change role` action button per row (next to Reset PIN). Opens a small dialog with a Manager/Cashier radio, saves via `setWorkerRole`.
- "Add worker" dialog: add a Role selector (defaults to Cashier).
- Reset PIN dialog stays exactly as it is.

**New "Roles & Permissions" tab** (admin-only)
- Two columns: Manager | Cashier.
- Grouped permission toggles:
  - POS: use POS, process refunds, sell gift cards
  - Catalog: edit services, edit categories
  - Customers: view, edit, delete
  - Memberships: view, manage
  - Reports: view, export
  - Workers: view shifts, edit shifts
- "Save changes" button per role.
- Note that super_admin / admin always have full access and can't be edited here.

## 4. Client-side enforcement

- Add `usePermissions()` hook that loads `role_permissions` once per session, combined with the user's roles, exposing `can(key)`.
- Update `AppSidebar.tsx` — replace hard-coded `roles: [...]` arrays with permission keys so links auto-hide for users without that permission.
- Sprinkle `can('services.edit')`, `can('reports.view')`, etc. on key actions (edit/delete buttons, Reports route guard).

RLS on the underlying tables stays as the real security boundary (already loosened for managers in the last migration). The permission system is the UX layer that decides which controls to show.

## 5. Data-loss prevention (general)

Migrations only change structure; rows are preserved across deploys. The only destructive actions in the app are explicit, admin-gated: soft-delete (recoverable from Recycle Bin), hard-delete RPCs, and "Reset to Official Menu" on the Services page. No code change deletes production data on push.

## Technical notes

- File touches: new migration; `src/lib/worker-auth.functions.ts`; `src/routes/_authenticated/settings.tsx` (Workers tab + new Roles tab); new `src/hooks/use-permissions.tsx`; `src/components/AppSidebar.tsx`.
- Role enum already has `manager` and `cashier`; no enum change needed.
- New worker still defaults to `cashier` role via the existing `handle_new_user` trigger; `setWorkerRole` runs after creation to upgrade to manager if selected.
