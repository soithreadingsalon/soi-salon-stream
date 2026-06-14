## Goal

Lock down appointment status changes so only the staff member the appointment is assigned to (or an admin) can change it. Claims already block re-claiming when an appointment is taken — no change needed there, but I'll surface it clearly in the UI.

## Server (`src/lib/appointments.functions.ts`)

Update `updateAppointmentStatus` handler:
1. Load the appointment row (`assigned_staff_id`).
2. Check caller role via `has_any_role(['super_admin','admin'])`.
3. Allow the update if **admin** OR `assigned_staff_id === context.userId`.
4. Otherwise throw: `"Only the assigned staff (or an admin) can change this appointment's status"`.

`claimAppointment` already requires `assigned_staff_id IS NULL` and throws "already claimed by someone else" — keep as is.

## UI (`src/routes/_authenticated/appointments.tsx`)

For each appointment row, compute:
- `isMine = a.assigned_staff_id === currentUserId`
- `canChangeStatus = isAdmin || isMine`

Then:
- Status action buttons (Check-In, Start, Complete, Cancel, No-Show) → render disabled with tooltip "Assigned to {name}" when `!canChangeStatus`.
- "Assign to me" button → already only shown when `assigned_staff_id == null`; add a small badge "Claimed by {staff}" on rows assigned to someone else so non-admin staff see why they can't act.
- Keep admin's staff `<Select>` unchanged.

No DB migration. No changes to claim rules or the recently-shipped Complete button / environment hiding.
