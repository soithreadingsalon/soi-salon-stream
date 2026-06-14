
## Goals

1. Only Admin/Super-admin can assign or reassign any staff member.
2. Manager/Staff/Cashier can see appointments and **claim** an unassigned one with one tap ("Assign to me").
3. Staff get a "Show only mine" toggle to see only their claimed appointments.
4. Status of each appointment is shown prominently (large pill on the row) and updates instantly in both the row and the top counters when changed.
5. Default date filter remains today (already correct) and UI is cleaner/friendlier.

## Changes

### 1. Server function: `claimAppointment` (new) — `src/lib/appointments.functions.ts`
- Input: `{ id: uuid }`.
- Auth: any signed-in user with role `staff | cashier | manager | admin | super_admin`.
- Logic: `UPDATE appointments SET assigned_staff_id = auth.uid(), reviewed_by = auth.uid(), reviewed_at = now() WHERE id = $1 AND assigned_staff_id IS NULL`. If `rowCount = 0` → throw `"Already claimed by someone else"`.
- Returns `{ ok: true, staffId }`.

### 2. Tighten `assignAppointment` — same file
- Add an admin check at top: `if (!has_any_role(userId, ['super_admin','admin'])) throw 'Only Admin can assign staff'`. Lookup via existing `has_role` RPC (call once for each role or add a small helper).

### 3. Permissions cleanup — `src/hooks/use-permissions.tsx` + seed/migration
- Remove `appointments.assign` from Manager's default `role_permissions` rows (migration: `DELETE FROM role_permissions WHERE role='manager' AND permission_key='appointments.assign'`).
- Keep the permission key in the enum so Admin can still grant it manually later if desired.
- Front-end `canAssign` becomes `isAdmin` only (drops the permission check).

### 4. Appointments page — `src/routes/_authenticated/appointments.tsx`

**Counters (fix stale top stats)**
Root cause is fine — `useQuery` already re-derives counters after `invalidateQueries`. The bug is that `statusMut`/`assignMut`/`createFn` and the new claim mutation must all invalidate `["appointments"]`. Audit and ensure every mutation invokes `qc.invalidateQueries({ queryKey: ["appointments"] })` (the new appointment dialog currently does, status/assign do — verify and keep). Add an **optional realtime hook** on the `appointments` table so changes from other devices/admin also update everyone's counters live (enable realtime publication in migration).

**Staff column**
- Admin: keep the staff `<Select>` dropdown (full reassign).
- Non-admin: render `Assigned to: <name>` OR an **`Assign to me` button** (primary style) when `assigned_staff_id` is null. Disabled while the mutation is pending.
- "(you)" label stays for rows assigned to the current user.

**Status visibility (prominent + reactive)**
- Move the status pill to a leading column / larger badge with the colored background, so it's the first thing visible on each row.
- Also show status in a header strip above action buttons on small screens.
- Confirm `statusMut.onSuccess` invalidates `["appointments"]` (it does) — counters will then recompute automatically.

**New "Mine only" filter**
- Add a toggle (Switch) "Show only my appointments" — defaults ON for non-admin staff, OFF for admin/manager. Filters the rendered list client-side by `assigned_staff_id === user.id`.

**Default-day status**
- Keep `from = to = today` default (already in place).
- Add quick-pick chips: **Today / Tomorrow / This week / All** above the date inputs.

**Polish**
- Slightly larger row spacing, sticky table header, condensed action buttons into an overflow menu on mobile, clearer "Unassigned" empty state with the Assign-to-me CTA, and a small legend explaining status colors.

### 5. Migration
- `DELETE FROM role_permissions WHERE role='manager' AND permission_key='appointments.assign';`
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;` (idempotent guard with DO block).
- No table/column changes needed.

## Out of scope
- No new `appointment_number` column — clarified that "appointment number" referred to status visibility, which is addressed above.
- Auth/RLS on the table stays as-is; the admin-only assign restriction is enforced inside the server function (manager role still passes RLS write check but the server fn rejects).

## Files touched
- `supabase/migrations/<new>.sql` (permission cleanup + realtime publication)
- `src/lib/appointments.functions.ts` (add `claimAppointment`, harden `assignAppointment`)
- `src/routes/_authenticated/appointments.tsx` (UI: claim button, mine filter, prominent status, quick-date chips, realtime subscription)
- `src/hooks/use-permissions.tsx` (no code change required; behavior changes via seed)
