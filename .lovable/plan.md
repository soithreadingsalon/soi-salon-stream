# POS redesign + dual-device sync

Two big changes, shipped together because they share the same data layer.

---

## 1. Cashier screen — industry-standard layout

The current screen scrolls the whole page because the cart, tip controls, discount, and totals all stack vertically. We're moving to the Square / Toast / Clover pattern.

**New layout (no page scroll):**

```text
+------------------------------------------------------+
| Top bar: search customer | register name | Customer  |
|          loyalty chip    | pair code      View btn   |
+----------------------------+-------------------------+
|                            |  CART                   |
|  CATALOG (60-65%)          |  - item rows (scroll    |
|  - category tabs (sticky)  |    inside cart only)    |
|  - service grid, large     |  -----------------------|
|    tap targets             |  Subtotal       $XX.XX  |
|  - search                  |  Tax            $XX.XX  |
|                            |  Total          $XX.XX  |
|                            |  -----------------------|
|                            |  [   CHARGE $XX.XX   ]  |
|                            |  [ Clear ] [ Hold ]     |
+----------------------------+-------------------------+
```

- The whole page is `h-screen` with `overflow-hidden`. Only the catalog grid and the cart item list scroll internally.
- **Tip and discount move out of the cart** into the Charge dialog (and onto the customer tablet — see below). The cart is just items + totals + Charge.
- Totals + Charge button are pinned to the bottom of the cart column.
- On tablet/narrow widths the cart becomes a slide-up sheet triggered by a floating "Cart (3) — $42" pill, so the catalog gets the full screen.

**Charge dialog (cashier side):**
- Opens when cashier taps Charge with at least one item.
- Has an inline discount input (% or $) and a "Send to customer for tip + payment" primary action.
- Once sent, the cashier screen **freezes** into a read-only "Waiting for customer…" overlay with two buttons: **Cancel & edit** (returns to cart, unlocks customer screen) and **Mark paid manually** (escape hatch if customer tablet fails).

---

## 2. True two-device sync

Replace the current `BroadcastChannel` + `localStorage` bridge (same-browser only) with Supabase Realtime so two physical devices can share an order.

### Pairing — 4-digit code

- New table `register_sessions(id, code, register_name, active_order_id, paired_at, last_seen_at)`.
- Cashier screen displays its register's pair code in the top bar (e.g. `4821`).
- Customer tablet opens `/customer-display`, types the code once, and stays paired in `localStorage`. Re-entering the code anywhere re-pairs.

### Live order = the `orders` row

- Today the in-flight cart only lives in the cashier's React state. We make the open `orders` row (status `open`) the source of truth as soon as the first item is added, and write `order_items` directly. Both devices subscribe via Supabase Realtime to that order id.
- Add a few columns to `orders` to carry the live UX state:
  - `register_session_id uuid`
  - `customer_tip_amount numeric`
  - `customer_payment_method text` — `cash` | `card` | `zelle`
  - `customer_paid_confirmed boolean`
  - extend `order_status` enum with `awaiting_customer` and `awaiting_confirmation`.
- Enable Realtime on `orders` and `order_items`.

### Handoff flow

```text
cashier                          customer tablet
-------                          ---------------
adds items, taps Charge   -->    sees cart appear
status = awaiting_customer       picks tip (% or $)
cashier UI freezes               picks Cash / Card / Zelle
                                 taps "I paid"  (self-checkout)
                          <--    status = awaiting_confirmation
sees "Customer paid via Cash"
auto-creates payment row,
status = completed,
unfreezes, prints receipt        shows "Thank you!" 4s, resets
```

- "Customer fully self-checkout" per your choice: customer taps **I paid in cash**, **Sent on Zelle**, or **Tap to pay (card)**. Card is mocked as instant-success for now (real terminal later).
- Cashier can hit **Cancel & edit** at any time before customer confirms — that flips status back to `open` and the customer tablet returns to a passive "waiting" view.
- After completion the cashier screen auto-resets and the customer tablet shows a 4-second thank-you, then idle.

### Customer tablet (`/customer-display`) becomes interactive

- Pair-code entry screen if not paired.
- Idle screen ("Welcome — please wait for your cashier") when no active order.
- Live cart + loyalty chip when cashier is building the order.
- Tip picker (15/18/20/25% + custom $ + No tip) + payment method buttons + big **I Paid** button when status is `awaiting_customer`.
- Thank-you screen on completion.

---

## Files to touch

**New**
- `supabase/migrations/<ts>_register_sessions_and_live_orders.sql` — new table, enum extension, new columns, Realtime publication, RLS.
- `src/lib/register-session.ts` — pair code helpers + Realtime subscribe to active order.
- `src/components/pos/ChargeDialog.tsx` — discount + send-to-customer.
- `src/components/pos/WaitingOverlay.tsx` — frozen cashier overlay.
- `src/components/pos/MobileCartSheet.tsx` — cart-as-sheet for narrow viewports.

**Edited**
- `src/routes/_authenticated/-pos/PosClient.tsx` — full layout rewrite (catalog 60% / cart 35% / no page scroll), persist cart to `orders`/`order_items` instead of local state, replace `BroadcastChannel` with Realtime channel, freeze on `awaiting_customer`.
- `src/routes/customer-display.tsx` — pair-code gate, Realtime subscription, tip picker, payment buttons, "I paid" CTA.
- `src/lib/pos-session.ts` — gutted (or removed) once Realtime path is in place.
- `src/routes/_authenticated/settings.*` (or a small new screen) — assign register name + show/regenerate pair code.

## Out of scope (call out so you're not surprised)

- Real Stripe Terminal / real Zelle verification — Card is a mock confirm; Zelle and Cash are honor-system "I paid" taps. Hooking real processors is a separate story.
- Offline mode — both devices need internet for Realtime.
- Multiple concurrent open orders per register (park / resume) — sticking with one active order per register for now.

## How you'll test in Lovable preview

1. Open `/pos` in one tab — note the 4-digit pair code in the top bar.
2. Open `/customer-display` in a second tab (or a phone on the same Wi-Fi using the deployed URL) — enter the code.
3. Add items on cashier → they appear on customer tab live.
4. Tap **Charge** → cashier freezes, customer sees tip + payment buttons.
5. Pick tip + Cash + **I paid** → cashier auto-completes, both reset.
6. Try **Cancel & edit** mid-flow → cashier unfreezes, customer goes back to passive view.