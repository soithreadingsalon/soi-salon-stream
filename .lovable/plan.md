## What I found

I checked the database directly. **Every one of the 36 completed orders has `tip_total = $0.00`** — not a single order has ever had a tip recorded.

I also checked the POS checkout code:
- The tip controls (15% / 18% / 20% presets + custom amount) are wired up correctly.
- When a tip is selected, it IS saved to `orders.tip_total`.
- The Reports page reads `tip_total` correctly and the "Tips by therapist" card splits it correctly.

**So this is not a bug in saving or reporting.** The tip column is empty because therapists are skipping the tip step at checkout — either they collect the tip separately (cash in hand) and never type it in, or the tip section in the Pay dialog is easy to miss.

## What to change

Make tip entry impossible to skip. Three pieces:

### 1. Force a tip choice before charging
In the Pay dialog, disable the Cash / Card / Zelle buttons until the cashier explicitly picks one of:
- A preset % (15 / 18 / 20)
- A custom $ amount
- **"No tip"** (explicit button — already exists, will be required)

This guarantees every order records an intentional tip value (including $0 when truly no tip).

### 2. Per-payment-method tip amounts (so a card sale can record a cash tip)
Today the tip is one number attached to the whole order, then split proportionally across payment rows in the report. That breaks down when a customer pays the service on card but hands the therapist cash for the tip — the report shows the tip as "card tip".

Add a "Tip paid by" selector next to the tip amount: Cash / Card / Zelle. The tip is then recorded as its own payment row with that method, so "Tips by therapist" shows the real cash-vs-card-vs-zelle split.

### 3. Visible tip warning on Reports
At the top of the Reports page, when `tip_total = 0` for more than X% of orders in the range, show a small amber notice: "No tips recorded on N of M orders — make sure staff enter tips at checkout." This makes the gap obvious to the admin.

## Technical notes

- POS: `src/routes/_authenticated/-pos/PosClient.tsx`
  - Add `tipChoiceMade` state; gate the three method buttons on it.
  - Add `tipMethod` state ("cash" | "card" | "zelle"); default to the chosen payment method.
  - In `completeSale`, if `tip > 0` and `tipMethod !== method`, insert a second row into `payments` with `amount = tip`, `payment_method = tipMethod`, plus a flag (e.g. `external_reference = "tip"`).
- Reports: `src/routes/_authenticated/reports.tsx`
  - "Tips by therapist": prefer rows flagged as tips when present; fall back to the proportional split for legacy orders.
  - Add the "no tips recorded" banner.
- No schema change required — `payments` already supports multiple rows per order and has `payment_method` + `external_reference`.

## Data-loss guarantee

Additive only. No tables changed, no historical orders edited. Existing $0 tip orders stay as-is.
