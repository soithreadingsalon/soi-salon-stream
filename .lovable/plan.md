## Goal

Make the right-hand POS panel a true one-step checkout. Remove the dedicated "Checkout" screen. Discount and tip live directly in the cart panel. The big **Charge** button opens a small payment-method popup (Cash / Card / Zelle) — clicking a method completes the sale immediately.

## Current flow (what to remove)

```text
Cart panel  ──[Charge]──▶  Checkout panel  ──[Complete sale]──▶  Done
            (step 1)        (discount, tip,
                             method, cash tendered)
```

## New flow

```text
Cart panel (one screen)                ──[Charge $X]──▶  Payment popup  ──▶  Done
  • items + qty                                          Cash / Card /
  • Discount $  (inline)                                 Zelle
  • Tip (% chips + custom)                               (click = complete)
  • Loyalty quick actions (free eyebrow / redeem pts)
  • Subtotal / Discount / Tax / Tip / Total
```

## Changes in `src/routes/_authenticated/-pos/PosClient.tsx`

1. **Delete `CheckoutPanel`** and remove the `mode: "cart" | "checkout"` state. The right panel (desktop and mobile sheet) always renders the cart.
2. **Expand `CartPanel`** to include, between the items list and the totals:
   - Loyalty quick actions block (moved verbatim from CheckoutPanel: free eyebrow, redeem points).
   - **Discount ($)** input.
   - **Tip** row: existing preset % chips + custom $ + "No tip".
   - Totals already show Subtotal / Discount / Tax / Total — add a Tip row when `tip > 0` (already wired in the checkout totals block).
3. **`Charge` button** stays at the bottom of the cart, label `Charge {fmt(grandTotal)}`, disabled when cart is empty. Clicking it opens a new **`PaymentMethodDialog`** (shadcn `Dialog`) instead of switching modes.
4. **New `PaymentMethodDialog`** — small, 3 large buttons (Cash / Card / Zelle, reusing the existing `PayBtn` style and `Banknote` / `CreditCard` / `Wallet` icons). Header shows `Total {fmt(grandTotal)}`. Clicking a button:
   - Sets `method` and immediately calls `completeSale()` (no cash-tendered / change screen, no confirm step).
   - While the mutation is pending, all three buttons disable and show a small spinner on the clicked one.
   - On success: close dialog, clear cart, reset discount/tip/loyalty state, show success toast + receipt (existing behavior).
5. **Cash drawer** continues to fire from `completeSale` when `method === "cash"` (unchanged — uses `openCashDrawer(settings)`).
6. **Remove**: `mode` state, `setMode` calls, the `<CheckoutPanel ... />` JSX in both desktop right column and the mobile `<Sheet>`, the `ArrowLeft` back-button, and the cash-tendered / change-due UI (no longer part of the flow).
7. **Keep** the existing variable-price / gift card / membership add-to-cart dialogs — they are unrelated to this checkout simplification.

## Files touched

- `src/routes/_authenticated/-pos/PosClient.tsx` — only file edited.

## Out of scope

- No DB or server-function changes. `completeSale` keeps its current signature and behavior.
- No changes to receipt, reports, services, settings, or the mobile bottom-bar trigger (it still opens the cart sheet — which now contains the inline discount/tip and the same Charge button).
- Cash-tendered / change-due is dropped from the UI per the one-step requirement. If you want it back as an optional drawer-side input, say so and I'll add it as a collapsible "Cash received" inside the Cash button row.
