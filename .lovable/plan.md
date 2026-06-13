# Plan: Reporting v2, Zelle/Closeout Polish, Appointments + Website Intake

All work is **additive**. Nothing in POS, services, customers, cash/card/Zelle, or current reports is removed or renamed. Existing tables get new columns only; nothing is dropped.

---

## 1. Global typography (Arial + tabular numerals)

- `src/styles.css`: set `--font-sans: Arial, "Helvetica Neue", Helvetica, sans-serif` and apply `font-variant-numeric: tabular-nums` on `table, .stat-number, .report-num` utilities.
- Add a `.num` utility for right-aligned tabular currency in tables.
- No font files needed (Arial is a system font).

---

## 2. Database changes (one migration, no destructive ops)

### 2a. Extend `payments`
- `payment_channel text` — `'in_person' | 'online' | 'external'`
- `provider text` — `'manual' | 'valcom' | 'zelle' | 'stripe' | 'gift_card' | 'other'`
- `card_funding text` — `'credit' | 'debit' | 'prepaid' | 'unknown'`
- `zelle_reference text`, `zelle_sender text`, `zelle_note text`
- `tip_amount numeric(12,2) default 0`, `refund_amount numeric(12,2) default 0`, `net_amount numeric(12,2) generated` (or trigger-maintained)
- Backfill existing rows: `payment_channel='in_person'`, `provider` derived from current `method`.

### 2b. New `appointments` table
Columns: `id, customer_id, customer_name, customer_phone, customer_email, service_id, service_name, appointment_date date, appointment_time time, duration_minutes int, assigned_staff_id, booking_source ('website'|'pos'|'walk_in'|'manual'), external_booking_id, external_source, status (enum: new|confirmed|checked_in|waiting|in_service|completed|cancelled|no_show), notes, reviewed_by, reviewed_at, checked_in_at, started_at, completed_at, cancelled_at, no_show_at, sync_status, last_synced_at, order_id (nullable, links to converted sale), created_at, updated_at`.
Full `GRANT` + RLS per existing role model (admin/manager full; cashier read; staff sees rows where `assigned_staff_id = auth.uid()` OR (`assigned_staff_id IS NULL` AND staff is on shift today)).

### 2c. New `appointments_deleted` shadow + `soft_delete_appointment` / `restore_appointment` functions (mirrors existing `customers_deleted` pattern).

### 2d. Nightly backup tables
- New tables: `orders_backup`, `payments_backup`, `appointments_backup` (same shape + `snapshot_date date`, `snapshot_at timestamptz`).
- `pg_cron` job at 02:30 America/New_York running a SECURITY DEFINER function that inserts yesterday's rows into the backup tables. Idempotent on `(id, snapshot_date)`.

### 2e. Staff shift fields on `worker_shifts`
Already exists per file list — verify it has `started_at/ended_at`; add `on_break_at`, `current_status text` only if missing.

### 2f. Permission keys (`role_permissions`)
Add seeds for: `reports.full`, `reports.today_only`, `appointments.view_all`, `appointments.assign`, `appointments.checkin`, `appointments.cancel`. Default `reports.today_only=true` for cashier (per your choice).

---

## 3. Reports v2 — `/reports` (rebuild section, keep route)

Replace the body of `src/routes/_authenticated/reports.tsx` with a new layout. Existing Excel export utility (`src/lib/reportExport.ts`) is reused and extended.

**Filter bar (sticky top):** Date (Today / Yesterday / This Week / This Month / Custom), Payment method, Staff, Order status (Paid / Refunded / Partial / Voided), Customer type (Walk-in / Returning / New).

**Summary cards (Arial, big tabular numerals):**
Total Sales · Cash · Card · Credit Card · Debit Card · Zelle · Valcom (External Card) · Gift Card · Refunds · Discounts · Tips · **Net Sales** · # Transactions · Avg Ticket.

**Charts:** donut (cash/card/zelle/other) + horizontal bar (card breakdown).

**Transaction table:** Time, Order #, Customer, Staff, Services, Method, Card Type, Amount, Tip, Discount, Refund, **Net**, Status, Reference, Actions (View / Print / Refund / Export row). Sticky totals row at top + bottom.

**Exports:** CSV (existing), Excel (existing — add new columns), **PDF** (new — via `jspdf` + `jspdf-autotable`; includes SOI logo, business header, filters, summary, breakdown, transactions, closeout block, generated-by + timestamp).

**Role gating:** uses `usePermissions().can('reports.full')`. Cashier with `reports.today_only` sees a stripped today-summary card view (no historical filters, no transaction-level PII export).

---

## 4. Zelle UX polish in POS

In `PosClient.tsx` payment dialog, when method = Zelle:
- Required text input "Zelle confirmation #"
- Optional "Sender name" + "Note"
- Yellow warning banner: *"Please confirm Zelle payment has been received before completing the order."*
- Checkbox "Payment received" required to enable Complete.
- Persists into new `zelle_*` columns; `provider='zelle'`, `payment_channel='external'`.

---

## 5. Daily Closeout enhancement

Existing closeout in Reports gets a new block:
- Expected Cash (sum of cash payments today) · Actual Counted (input) · **Difference**
- Side-by-side: Valcom total · Zelle total · Gift Card total · Refund total · Net Sales
- Only cash affects expected drawer.
- "Save closeout" writes a `daily_closeout` row (new lightweight table) and is included in PDF/Excel export.

---

## 6. Appointments module — `/appointments`

New route `src/routes/_authenticated/appointments.tsx` + sidebar entry.

**Layout:** Today queue (kanban-ish columns: New website / Waiting / In service / Completed today) + list/calendar toggle + filters (date, status, source, staff, search by name/phone).

**Badges:** "New website booking", "Needs assignment", "Customer waiting >10 min".

**Per-appointment actions:**
- Assign / Reassign staff (admin/manager)
- Check In · Start Service · Complete · Cancel · Mark No-Show (role-gated)
- **Convert to Sale** → opens POS with customer + service prefilled; on payment complete, appointment auto-flips to `completed` and stores `order_id`.

**Staff view:** sees only their assigned + unassigned-today rows when their `worker_shifts` row is active today.

---

## 7. Website booking intake (Scenario B — endpoint)

Your website already has a booking form. We'll build a single signed endpoint it can POST to:

- `src/routes/api/public/website-appointment.ts` (TanStack server route under `/api/public/*`).
- HMAC-SHA256 signature check using a new secret `WEBSITE_BOOKING_SECRET` (header `x-soi-signature`).
- Zod-validated body: `{ customer_name, customer_phone, customer_email?, service_name, appointment_date, appointment_time, duration_minutes?, notes?, external_booking_id? }`.
- Server-side fuzzy match to existing `customers` by phone; create one if no match.
- Insert into `appointments` with `booking_source='website'`, `status='new'`, dedup on `external_booking_id`.
- Returns `{ ok:true, appointment_id }`.

After deploy I'll give you:
- The stable URL: `https://project--<id>.lovable.app/api/public/website-appointment`
- The secret value (one-time)
- A 10-line example payload + HMAC snippet your web dev can drop into the existing form handler.

If the website is on WordPress/Wix/Squarespace, the snippet works from any backend or Zapier webhook.

---

## 8. Permissions wiring

Extend `src/hooks/use-permissions.tsx` `PermissionKey` union with the new keys. Sidebar links and report sections check `can(...)`. Default seed for cashier: `reports.today_only=true`, `pos.use=true`. Staff (`cashier` role used as threading specialist for now): `appointments.checkin=true`, others false.

If you want a dedicated `staff` role distinct from `cashier`, say so and I'll add it; otherwise we re-use the existing `cashier` role per `AppRole` already defined in `use-auth.tsx`.

---

## 9. Notifications (in-POS only — no email/SMS this round)

Realtime channel on `appointments` insert → toast + sidebar dot on `/appointments` for admin/manager/on-shift staff. No external delivery (kept simple).

---

## 10. Files touched / added

**Added**
- `supabase/migrations/<ts>_reports_v2_and_appointments.sql`
- `src/routes/_authenticated/appointments.tsx`
- `src/routes/_authenticated/-reports/ReportsV2.tsx` (extracted sections)
- `src/routes/_authenticated/-reports/ClosingDialog.tsx` (enhanced)
- `src/routes/_authenticated/-appointments/AppointmentCard.tsx`, `AssignStaffPopover.tsx`, `ConvertToSaleButton.tsx`
- `src/routes/api/public/website-appointment.ts`
- `src/lib/appointments.functions.ts` (server fns: list/assign/checkin/complete/cancel/convert)
- `src/lib/reports.functions.ts` (aggregations for v2 cards/charts)
- `src/lib/pdfExport.ts` (jsPDF wrapper)
- `mem://index.md` + memory files for fonts/permissions

**Edited**
- `src/styles.css` (Arial, tabular-nums)
- `src/components/AppSidebar.tsx` (+ Appointments link, perm-gated)
- `src/hooks/use-permissions.tsx` (new keys)
- `src/routes/_authenticated/-pos/PosClient.tsx` (Zelle fields; appointment-prefill via search param)
- `src/routes/_authenticated/-pos/ReceiptDialog.tsx` (Arial + tabular numerals)
- `src/routes/_authenticated/reports.tsx` (host new layout)
- `src/lib/reportExport.ts` (new columns)

**Deps to install:** `jspdf`, `jspdf-autotable`, `recharts` (only if not already present).

---

## 11. Rollout order

1. Migration (DB columns, appointments, backup tables, cron, permission seeds).
2. Arial + tabular-nums.
3. Reports v2 + PDF + closeout.
4. Zelle UX.
5. Appointments module + permissions + sidebar.
6. Website intake endpoint + secret + sample snippet for your web dev.
7. Manual run through the testing checklist you provided.

---

## Open items to confirm (won't block plan approval — answer when ready)

- **Role for threading specialists**: re-use existing `cashier` role, or add a new `staff` role? (defaulting to reuse `cashier`).
- **Website booking source**: which platform is the existing form on? Determines the snippet I hand you (curl / PHP / JS / Zap).
- **Logo for PDF**: I'll reuse `SoiLogo` SVG; OK?

If the plan looks right, approve and I'll start with the migration.