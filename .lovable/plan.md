# Add Tip Flow + Customer-Facing View

## 1. Tip selection on the cashier POS

In `PosClient.tsx`, add a Tip section that appears once the cart has items, just above the totals:

- **Percentage shortcuts**: 15%, 18%, 20%, 25% (pulled from `business_settings.tip_presets`, fallback to defaults). Calculated off subtotal − discounts (pre-tax).
- **Custom $ amount**: a numeric input ("$ Custom") that overrides the percentage selection.
- **No Tip** button to clear.
- Selected preset is visually highlighted (gold ring).
- The chosen tip flows into the existing `tip_total` column on `orders` — no schema change needed.
- Cart totals update live: Subtotal → Discount → Tip → Tax → **Total**.
- Receipt already supports tip; just confirm it renders.

## 2. Customer-facing view (second screen / "flip to customer")

A second view of the same active cart, designed for the customer to see and approve. Two ways to access it:

**A. Side-by-side toggle (in-preview testing)**
A header button **"Customer View"** opens a separate route `/customer-display` in a new browser tab/window. Both views read the same cart from the database in real-time.

**B. How they stay in sync**
- Cashier's working cart is persisted as a single `orders` row with `status = 'open'` (already how it works).
- The customer view subscribes via Supabase Realtime to that order + its `order_items`, so every add/remove/tip change on the cashier side appears instantly on the customer side.
- A small `localStorage` key `soi.activeOrderId` tells the customer-display route which order to show. The cashier toggle writes this key and opens the new tab.

**Customer-display screen contents** (large, minimal, brand-styled):
- SOI logo + "Welcome" header
- Itemized list (service name, qty, price)
- Subtotal, discount, **tip (with the tip selector mirrored here so the customer can pick their own tip on a customer-facing tablet)**, tax, **Total** in huge type
- Loyalty status if customer attached ("You have X points • Y visits to next free eyebrow")
- "Thank you" state once payment succeeds
- No admin/cashier controls, no nav

Tip changes from either side write to the same `orders.tip_total` and propagate via realtime.

## 3. Realtime enablement
Add `orders` and `order_items` to the `supabase_realtime` publication via a small migration so the customer-display screen receives live updates.

## 4. How to test in the Lovable preview

1. Open the POS at `/pos` in the preview — this is the **cashier view**.
2. Add 2–3 services to the cart, attach a customer.
3. Click the new **"Customer View"** button in the top bar — a second browser tab opens at `/customer-display` showing the same cart.
4. Arrange the two tabs side-by-side (or use two monitors / a tablet for the customer tab in production).
5. On the cashier tab, tap a tip preset (e.g. 20%) — watch the customer tab update instantly.
6. On the cashier tab, type a custom tip amount — confirm both views show it.
7. Tap "No Tip" — confirm both clear.
8. Charge the order (Cash/Card mock) — customer tab flips to a "Thank you" screen, cashier tab shows the receipt dialog.

In production this is the same flow but the customer tab runs on a second screen / customer-facing tablet pointed at the same login.

## Files touched
- `src/routes/_authenticated/-pos/PosClient.tsx` — tip UI, "Customer View" button, persist active order id
- `src/routes/customer-display.tsx` (new, public route, no auth wrapper needed since it just reads an order id) — customer-facing screen with realtime subscription
- `supabase/migrations/<ts>_realtime_orders.sql` — enable realtime on orders + order_items
- `src/routes/_authenticated/-pos/ReceiptDialog.tsx` — verify tip line renders (likely already does)

## Out of scope
Real Stripe Terminal customer prompts, signature capture, tip-on-card-reader (those come with real Stripe Terminal in a later round).
