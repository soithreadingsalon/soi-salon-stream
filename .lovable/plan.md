# Unify Website Booking → Appointment → Customer

Make one shared set of fields flow end-to-end so every website booking automatically becomes (a) an appointment **and** (b) a customer record, with the manual Appointment and Customer forms aligned to the same fields.

## Shared field set (single source of truth)

Taken from the website booking form:

| Field | Required | Notes |
|---|---|---|
| Full Name | yes | |
| Phone Number | yes | |
| Email | no | |
| Service Category | no | dropdown from `service_categories` |
| Service | no | free text (matches website) |
| Preferred Date | appt only | |
| Preferred Time | appt only | |
| Notes | no | |
| Marketing opt-in | no | customer-level toggle, defaults `true` for website bookings |

Date/time only live on the appointment. Everything else lives on **both** the appointment and the customer.

## 1. Schema additions

Migration `align_customer_appointment_fields`:

```sql
ALTER TABLE public.customers
  ADD COLUMN preferred_service_category_id uuid REFERENCES public.service_categories(id),
  ADD COLUMN preferred_service_name text;

ALTER TABLE public.appointments
  ADD COLUMN service_category_id uuid REFERENCES public.service_categories(id);
-- service_name, customer_name/phone/email, notes already exist
```

Plus a backfill block that, for every existing appointment with `customer_id IS NULL`, matches an existing customer by phone (digits-only last 7) or email, creates one when no match, and links it back to the appointment.

## 2. Auto-create / merge customer on every appointment

A new server helper `upsertCustomerFromAppointment(payload)` is called from:

- `src/routes/api/public/website-appointment.ts` (website POST)
- `src/lib/appointments.functions.ts` → `createAppointment` (manual entry from Appointments tab)

Logic:
1. Match by phone (digits-only last 7) → else by email.
2. If found: fill in any blank fields (email, preferred category/service, notes append), keep existing values otherwise.
3. If not found: insert customer with all shared fields; `marketing_opt_in = true` for website bookings, follows form toggle for manual.
4. Set `appointment.customer_id` to the resulting customer id.

## 3. UI alignment

**Appointments tab — New / Edit appointment dialog** (`src/routes/_authenticated/appointments.tsx`):
- Reorder/relabel fields to match the website form exactly: Full Name*, Phone*, Email, Service Category (dropdown), Service, Preferred Date, Preferred Time, Notes.
- Submitting calls `createAppointment`, which auto-creates/merges the customer.

**Customers tab — New / Edit customer dialog** (`src/routes/_authenticated/customers.tsx`):
- Replace current fields with the shared set: Full Name*, Phone*, Email, Service Category, Service, Notes, Marketing opt-in. Keep Birthday and Allergies as optional extras (existing data).
- Add an **Export CSV** button (admin/manager) downloading: full_name, phone, email, preferred_service_category, preferred_service_name, marketing_opt_in, last_visit_at, visit_count, total_spend, notes, created_at — for marketing campaigns on external platforms.

## 4. Files changed

- `supabase/migrations/<new>.sql` — schema + backfill
- `src/lib/customers.functions.ts` (new) — `upsertCustomerFromAppointment`, `listCustomersForExport`
- `src/lib/appointments.functions.ts` — call upsert in `createAppointment`; accept `service_category_id`
- `src/routes/api/public/website-appointment.ts` — accept `service_category` (slug or name → id), call upsert, store on appointment
- `src/routes/_authenticated/appointments.tsx` — aligned New/Edit dialog
- `src/routes/_authenticated/customers.tsx` — aligned New/Edit dialog + Export CSV button

## Out of scope
- Changing the public website HTML (already has the right fields; we just consume them).
- Sending campaigns in-app (export-only, as requested).
