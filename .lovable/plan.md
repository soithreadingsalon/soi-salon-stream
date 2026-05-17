## Goal
One-screen POS with big touch-friendly UI, PIN-only worker login, full admin control from Settings, and properly sized 58mm receipts that include the cashier's name.

## 1. Remove customer display & dual-sync
- Delete `src/routes/customer-display.tsx` and `src/lib/register-session.ts`.
- Remove pair-code topbar, `register_sessions` reads, `live_cart` publishing, and Realtime subscriptions from `PosClient.tsx`.
- Migration: drop `register_sessions` table and the `register_session_id`, `customer_tip_amount`, `customer_payment_method`, `customer_paid_confirmed` columns on `orders`; remove `awaiting_customer` / `awaiting_confirmation` enum values (orders revert to `open` → `completed`).

## 2. POS layout — single screen, bigger text, inline charge
- Keep the two-pane `h-screen` layout (catalog left, cart right) but bump font sizes: cart items `text-lg`, totals `text-2xl`, service tiles larger.
- Replace the modal ChargeDialog with an **inline checkout panel** that slides into the cart pane when the cashier taps **Charge**. It contains:
  - Discount field ($ or %)
  - Tip presets (15/18/20/25 + custom + No tip)
  - Payment method buttons (Cash / Card / Zelle)
  - Big **Complete Sale** button
- No more "waiting for customer" / frozen overlay — cashier handles everything.
- On completion → write `orders` + `order_items` + `payments` with `cashier_id = current worker`, show ReceiptDialog.

## 3. Worker PIN login (replaces email/password)
- New table `worker_pins` (worker_id → profiles.id, pin_hash, active). PINs hashed with bcrypt.
- New public route `/login` shows 3 worker tiles (avatar + name). Tap tile → 4-digit PIN pad → unlock.
- Server function `signInWithPin({ workerId, pin })`: verifies hash, then signs the browser in to that worker's Supabase user via a one-time magic token created with `supabaseAdmin.auth.admin.generateLink` (or sets a custom session cookie). Worker's `auth.uid()` then drives RLS as today.
- The admin/owner still signs in with email+password (separate "Admin login" link on the PIN screen).
- `AppSidebar` shows currently signed-in worker name + quick "switch worker" button (signs out, returns to tile picker).

## 4. Admin Settings — full editable panel
Rebuild `/settings` as a tabbed page (admin/super_admin only). Non-admins are redirected.

- **Business** — edit all `business_settings` fields (name, address, phone, email, website, hours, logo upload, tax rate, tip presets, currency, timezone, receipt footer, refund policy).
- **Services** — CRUD on `service_categories` and `services` (name, price, category, image, active, sort order).
- **Workers & PINs** — list profiles with `cashier` role; add new worker (creates auth user + profile + worker_pin), set/reset 4-digit PIN, deactivate.
- **Customers & Loyalty** — search customers, edit details, manually adjust `points_balance` and `free_eyebrow_credits` with audit log entries.

## 5. Receipt for 58mm thermal
Rework `ReceiptDialog.tsx` print stylesheet:
- Fixed `width: 58mm`, `@page { size: 58mm auto; margin: 2mm; }`.
- Monospace font (e.g. `"Courier New"`), base `font-size: 12pt`, business name `14pt bold`, total `16pt bold`.
- 32-char-per-line layout: item name left, price right-aligned with dot leaders for long names.
- Include: logo (optional), business name + address + phone, order #, date/time, **Served by: {cashier full_name}**, line items with qty × price, subtotal/discount/tax/tip/total, payment method, receipt footer, "Thank you" line.
- Hide everything else from print via `@media print`.
- If the user uploads a reference photo later, fine-tune column widths and font sizes to match.

## 6. Cashier-name on receipt
- `orders.cashier_id` is already populated. Receipt query joins `profiles` to display `full_name` under "Served by".

## Technical notes
- Migrations needed (in one batch): drop register_sessions + customer_* columns; create `worker_pins` table with RLS (only admins can write, worker can read own); enum cleanup for `order_status`.
- Server functions in `src/lib/`: `worker-pin.functions.ts` (verify PIN, mint session), `admin-workers.functions.ts` (create/reset PIN).
- New components: `src/routes/_authenticated/-pos/InlineCheckout.tsx`, `src/routes/login.tsx` rewrite (worker tile picker + PIN pad), `src/routes/_authenticated/settings/-tabs/*`.
- Receipt printing relies on CSS `@media print` — no extra libs.

## Out of scope (ask later if needed)
- Real Stripe Terminal / Zelle integration (still mock).
- Cash drawer / daily closeout report.
- Importing the actual receipt photo for pixel-perfect tuning (will adjust once you send it).
