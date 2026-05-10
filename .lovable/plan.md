# Make the Customer Display Interactive

Right now `/customer-display` is read-only — it mirrors what the cashier sees but the customer can't touch anything. We'll add the two things a customer actually does at checkout: **pick a tip** and **confirm they're ready to pay**.

## How it will work in production

- **Cashier device** (iPad/laptop) runs `/pos` — staff add services, attach customer.
- **Customer-facing device** (second tablet on a stand, facing the guest) runs `/customer-display` — same Wi-Fi, same login session. Both tabs sync live via the existing `BroadcastChannel` + `localStorage` bridge in `src/lib/pos-session.ts`.
- Customer taps their tip and a big **"I'm Ready to Pay"** button. That signals the cashier, who then taps **Charge** (cash/card) on their side. Cashier always controls the actual money movement — customer just picks tip + confirms.

(If the two devices are physically separate, BroadcastChannel/localStorage won't cross devices. For real two-device sync we'd need to upgrade to Supabase Realtime on the `orders` row — flagged below as a follow-up. For a single-device "flip the screen to the customer" flow, the current bridge works perfectly.)

## Changes

### 1. `src/lib/pos-session.ts`
Extend `PosSession` so the customer side can write back to the cashier:
- `customerTipPct: number | null` and `customerTipCustom: number` — tip chosen on customer display
- `customerReady: boolean` — true when customer taps "Ready to Pay"
- Keep cashier's `tipPct`/`tipCustom` as-is. Cashier view shows whichever was set most recently (with a small "customer chose 20%" badge).

### 2. `src/routes/customer-display.tsx`
Add a tip picker + confirm button (only visible when cart has items and not yet paid):

- **Tip section** (large, touch-friendly):
  - Preset buttons: 15% / 18% / 20% / 25%, each showing the live $ amount
  - "Custom $" numeric input
  - "No tip" button
  - Selected option gets gold ring, matches cashier styling
- **"I'm Ready to Pay"** button — full-width, gold, large. When tapped:
  - Sets `customerReady: true` and publishes session
  - Button swaps to a "Waiting for cashier…" state with a subtle pulse
- When `status === "paid"` it flips to the existing Thank You screen.

### 3. `src/routes/_authenticated/-pos/PosClient.tsx`
- Subscribe to session updates (already publishing; now also reading customer-side fields).
- When customer picks a tip, mirror it into cashier's `tipPct`/`tipCustom` so totals stay in sync, and show a small "Customer chose 20% tip" pill near the Tip section.
- When `customerReady` flips true, show a green banner above the Charge buttons: **"Customer is ready to pay"**. Charge buttons remain the cashier's responsibility.
- Reset `customerReady` and customer-side tip fields after a successful charge or cart clear.

## Out of scope (call out to user)

- **True multi-device sync** across two physical tablets — needs Supabase Realtime on `orders`. Quick follow-up if you want it.
- **Customer-initiated card payment** (customer taps their card on a Stripe Terminal reader without cashier action) — that's the real Stripe Terminal integration in the later round.
- Quantity edits on customer side — intentionally kept cashier-only.

## Files touched

- `src/lib/pos-session.ts` — add customer-side fields
- `src/routes/customer-display.tsx` — tip picker + ready-to-pay button
- `src/routes/_authenticated/-pos/PosClient.tsx` — read customer choices, show ready banner
