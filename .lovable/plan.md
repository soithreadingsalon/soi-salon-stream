## 1. Admin: edit a completed order's payment method (PIN-gated)

**Use case:** A cashier accidentally rang a sale as Card when it was Cash. An admin opens the order from Reports → Orders, hits "Edit payment", enters the override PIN, and switches the method (cash / card / zelle). Works for orders with a single payment row (most common). For split-payment orders we show the rows and let admin change the method of each.

**Where:**
- Reports → Orders table: add a small "Edit payment" button on each row (admin / super_admin only).
- Opens a dialog showing each payment row with a method dropdown (Cash / Card / Zelle / Other) and a PIN input.
- On save: server fn verifies PIN against the stored hash in `business_settings`, updates `payments.method` + `payments.payment_method`, writes an `audit_logs` entry (who, when, before/after) so nothing is lost silently.

**PIN storage (per your choice):** new fields on `business_settings`: `override_pin_hash`, `override_pin_salt`. Seeded once with `1987`. Settings → new "Security" card with "Change override PIN" (admin-only). PIN itself is never returned to the client — only a "PIN is set" indicator.

## 2. Tips by therapist in Reports

The logged-in cashier IS the therapist (existing `orders.cashier_id`). Today Reports only shows one global Tips KPI. Adding:

- New **"Tips by therapist"** card on Reports: therapist name · # tipped orders · cash tips · card tips · zelle tips · total tips. Respects the existing date / cashier / method filters.
- New **Discount** column in the Orders table (currently missing) and Discount totals row at the bottom.
- Tips column already exists — adding a totals footer row (Subtotal / Discount / Tax / Tip / Total) so the numbers tie out at a glance.
- Excel/CSV export gains a "Tips by therapist" sheet and the Discount column on the orders sheet.

No POS changes needed — therapists already enter tips at checkout; we're surfacing the data correctly.

## 3. Consistent typography

Audit and align all pages to the project's two-font system already defined in `src/styles.css` (display font for headings, sans for body). One-off offenders (Reports, Settings, Workers, Memberships, POS dialogs) currently mix raw `text-*` weights without `font-display` on headers, and a couple use the browser default. I'll:

- Sweep every route and ensure every `<h1>/<h2>/<h3>` uses `font-display` and consistent sizes (`text-3xl` / `text-xl` / `text-base`).
- Remove ad-hoc `style={{ fontFamily: ... }}` where present.
- Confirm `body` in `styles.css` sets the body font on `*` and that print styles inherit it.

## Data-loss guarantee

All changes are additive:
- Migration adds columns to `business_settings` and (if needed) inserts a default PIN row — no data dropped.
- Payment-method edits go through an audited UPDATE; the original method is captured in `audit_logs`.
- No table is dropped, renamed, or truncated.

## Technical details

**Migration**
- `business_settings`: add `override_pin_hash text`, `override_pin_salt text`. Seed by hashing `1987` for the existing row.
- No new tables. `audit_logs` already exists.

**Server fns (`src/lib/admin-overrides.functions.ts`, new)**
- `setOverridePin({ newPin })` — admin only.
- `hasOverridePin()` — returns boolean for UI.
- `updateOrderPaymentMethod({ orderId, paymentId, newMethod, pin })` — verifies admin role + PIN, updates row, writes audit log. Uses `supabaseAdmin` loaded inside the handler.

**UI**
- `src/routes/_authenticated/reports.tsx`: add Discount column + totals row, "Tips by therapist" card, "Edit payment" button + dialog.
- `src/routes/_authenticated/settings.tsx`: new "Security" card with override-PIN management (admin-only).
- Typography sweep across route files and shared components.

**Files touched**
- New: `supabase/migrations/<ts>_override_pin.sql`, `src/lib/admin-overrides.functions.ts`, `src/routes/_authenticated/-reports/EditPaymentDialog.tsx`.
- Edited: `reports.tsx`, `settings.tsx`, `src/lib/reportExport.ts`, plus typography touch-ups across routes.
