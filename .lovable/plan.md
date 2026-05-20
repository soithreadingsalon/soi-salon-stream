# SOI Threading Salon POS — Full Update Plan

This is a large, multi-area change. I'll ship it in clear database + UI phases. Everything below uses Lovable Cloud (your existing backend) and the existing TanStack Start app — no new stacks.

## 1. Database changes (one migration)

New / updated tables:
- `services` — wipe and reseed from the attached Final.pdf menu. Add columns: `is_variable_price boolean`, `price_label text` (e.g. "$180 & up"), `source text default 'official_menu'`. Categories normalized to: Threading, Waxing, Facials, Hair Care, Henna, Men.
- `gift_cards` — code, amount, balance, recipient_name, buyer_name, status, timestamps.
- `memberships` — customer_id, customer_name, membership_type, price, start_date, expiration_date, status, timestamps.
- `orders` / `order_items` — extend `order_items` with `item_type` ('service'|'gift_card'|'membership'), keep service_id nullable. Add `payment_method` ('cash'|'card'|'zelle'), `payment_reference`, `cash_drawer_status` to `payments` or `orders`.
- `worker_shifts` — worker_id, date, clock_in_at, clock_out_at, total_hours, status, is_adjusted, admin_notes.
- `business_settings` — add `cash_drawer_enabled`, `cash_drawer_connection_type`, `cash_drawer_printer_ip`, `cash_drawer_printer_port`. Update business name/address/phone to the new Wayne, NJ values.

DB function: `reset_services_to_official_menu()` (SECURITY DEFINER, admin-only) — wipes `services` and reseeds the exact menu.

RLS: admin-only writes for services/memberships/gift_cards/shifts settings; cashiers can insert orders, gift_cards, memberships, and their own shifts.

## 2. POS one-screen checkout (`src/routes/_authenticated/-pos/PosClient.tsx`)

Single screen, no second discount step:

```text
┌──────────────────────────────┬─────────────────────────┐
│ [Threading][Waxing][Facials] │ Customer name [_____]   │
│ [Hair Care][Henna][Men]      │ ─ Cart ───────────────  │
│ [Gift Card][Membership]      │ • Eyebrow      $10  [x] │
│ Search [____________]        │ • Body Wax    $180  [✎] │
│ ┌──┬──┬──┬──┐                │ Subtotal       $190     │
│ │  │  │  │  │  service tiles │ Discount [None ▾][__]   │
│ └──┴──┴──┴──┘                │ Total          $190     │
│                              │ [Clear]    [ Charge ▶ ] │
└──────────────────────────────┴─────────────────────────┘
```

- Variable-price services (`& up`) open a tiny inline price editor on add and a pencil in the cart.
- Gift Card / Membership tabs swap the left panel for their own forms; submitting adds them to the cart as `item_type` rows.
- Discount: None / Fixed $ / Percent — live recalculates total. Validates `discount ≤ subtotal`, no negatives.
- Charge button opens a small **payment method** sheet (Cash / Card / Zelle) — that's the only extra step.

## 3. Payment + cash drawer

On confirm:
1. Insert order, items, payment (with method + optional reference).
2. If method = cash → call `openCashDrawer()` abstraction.
3. Show success → clear cart.

`src/lib/cashDrawer.ts`:
- `openCashDrawer()` reads `business_settings.cash_drawer_*`.
- Modes: `disabled`, `manual`, `receipt_printer` (window.print trigger), `escpos_network` (POST raw bytes `[27,112,0,25,250]` to `http://{ip}:{port}` — wrapped in try/catch with clear "needs local POS bridge" comment), `escpos_usb` (WebUSB stub with TODO).
- Records `cash_drawer_status` = `opened` | `failed` | `not_applicable` | `disabled` on the payment row.
- Admin Settings → Cash Drawer tab with all fields + **Test drawer** button.

## 4. Customer entry from POS

- Inline `Customer Name` field on the right panel, optional.
- "Add more details" reveals phone + email.
- On charge: lookup by name+phone/email; if no match → insert; attach `customer_id` to order. No duplicates.

## 5. Worker clock in / out

- On first POS load each day, if no open shift → show "Clock In" modal blocking the screen.
- Header shows clock status + Clock Out button.
- Trying to Charge with no open shift → toast "Clock in to continue" and opens the modal.
- Admin Settings → new **Shifts** tab: list shifts, edit clock_out + notes (marks `is_adjusted`).

## 6. Admin pages updates

- **Services** (`services.tsx`): show category, base price, "& up" label, variable flag toggle, active toggle, sort. Add **"Reset to Official Menu"** button (calls the RPC, confirms via existing two-step delete dialog pattern).
- **Customers** (`customers.tsx`): already has CRUD — verify columns include total visits/spend/last visit.
- **Settings** (`settings.tsx`): existing tabs + new **Cash Drawer** and **Shifts** tabs. Prepopulate business name = "SOI Threading Salon", address = "180 Hamburg Turnpk, Wayne, NJ 07470", phone = "551-301-3894".
- **Reports** — new route `/reports`: filters (hourly / half-day / day / custom / week / month / year / worker / payment method / item type / customer / discount-only); KPIs (gross, discounts, net, cash/card/zelle totals, service/gift-card/membership totals, sales by worker, sales by category, # customers, AOV); transactions table; CSV export + Print.
- **Gift Cards** + **Memberships** — small admin list pages to view sold items.

## 7. Receipt + address everywhere

Update `ReceiptDialog.tsx`, dashboard, settings prefill, and any hard-coded copy to:

```
SOI Threading Salon
180 Hamburg Turnpk, Wayne, NJ 07470
551-301-3894
```

## 8. Responsive

- POS: lg = two-column sticky right cart; md/sm = left panel full-width with bottom-sheet cart (sticky bar with total + "View cart / Charge").
- Admin: sidebar collapses (already does); tables → stacked cards under md; all touch targets ≥ 44px, primary actions ≥ 48px.

## 9. `/soi` admin route + credentials

You asked for a private `/soi` route with username `SOI` / password `Soi@wayne2026`.

> ⚠️ Important caveat before I build this: the project already uses Lovable Cloud auth (Supabase) with role-based access (`super_admin`, `admin`, …). A second, hard-coded username/password gate is strictly **less secure** than the existing auth and the password would have to live in the client bundle (anyone viewing source can read it). 
>
> **My recommendation:** make `/soi` an alias route that simply redirects to `/login` and, after sign-in, to `/dashboard`, AND create a real admin user with email `soi@…` (you pick) and password `Soi@wayne2026` in the auth system. This gives you the same "secret URL" feel with real security.
>
> If you'd rather I implement the literal hard-coded `SOI` / `Soi@wayne2026` gate in addition to real auth, say "use hard-coded gate" and I will, with the security caveat documented in code.

I'll default to the recommended approach unless you say otherwise.

## 10. Files touched (high-level)

- New migration (services reseed + new tables + RPC + settings columns).
- `src/lib/cashDrawer.ts` (new)
- `src/lib/pos.functions.ts` (new — checkout server fn that creates order+items+payment+customer+drawer status atomically)
- `src/routes/_authenticated/-pos/PosClient.tsx` (rewrite to one-screen + tabs + cash drawer)
- `src/routes/_authenticated/-pos/ReceiptDialog.tsx` (address + payment method)
- `src/routes/_authenticated/services.tsx` (variable price, reset menu button)
- `src/routes/_authenticated/settings.tsx` (Cash Drawer + Shifts tabs, business prefill)
- `src/routes/_authenticated/reports.tsx` (new)
- `src/routes/_authenticated/gift-cards.tsx`, `memberships.tsx` (new admin lists)
- `src/routes/soi.tsx` (new alias redirect)
- `src/components/AppSidebar.tsx` (add Reports / Gift Cards / Memberships nav)

## Open questions before I start

1. **`/soi` gate** — go with my recommended redirect + real admin user, or hard-code the credentials as you wrote?
2. **Membership types** — you didn't list specific membership tiers/prices. OK to start with free-form (admin enters type + price per sale) and add presets later?
3. **Existing service data** — confirm OK to **wipe** the current `services` table and reseed from the menu (existing past orders keep their snapshot in `order_items.service_name` + `unit_price`, so reports stay intact).

Once you answer these I'll execute the migration and ship the code.
