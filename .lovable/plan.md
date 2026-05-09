
## What's broken right now

The root cause of "denies when I try to add service / charge" is a Postgres permission issue, not a logic bug:

```
permission denied for function has_any_role
```

Every RLS policy on `orders`, `order_items`, `payments`, `user_roles`, etc. calls `public.has_any_role(...)`. That function exists, but `EXECUTE` was never granted to the `authenticated` role, so every policy check fails → 403 on every insert and on `user_roles` reads. This blocks checkout entirely.

Multiple-services-per-cart already works in code (cart accepts many items, qty +/-), but you can't see it because checkout 403s before the order saves.

## Plan

### 1. Fix the database permission bug (migration)
- `GRANT EXECUTE ON FUNCTION public.has_role, public.has_any_role TO authenticated, anon;`
- Re-verify by inserting a test order via the POS after the fix.

### 2. Add loyalty / rewards (schema + logic)
- New table `loyalty_accounts` (customer_id, points_balance, lifetime_points, eyebrow_threading_count, free_eyebrow_credits).
- New table `loyalty_transactions` (customer_id, order_id, points_delta, reason, created_at) for full audit trail.
- Rules seeded into `business_settings` (already exists) + new columns:
  - 1 point per $1 spent (configurable).
  - Every 10th eyebrow threading = 1 free eyebrow credit (matches SOI's classic loyalty).
  - 100 points = $5 off redeemable at checkout.
- DB trigger on `orders` (status → completed) that:
  - awards points,
  - increments eyebrow threading counter when an `order_items.service_name = 'Eyebrow'` (threading category) is in the order,
  - issues free credits at every 10th visit.
- RLS: customers row readable to all authenticated staff; loyalty writes only via trigger / manager+.

### 3. Make the POS dashboard genuinely user-friendly
Current pain points on a 748px viewport: tiny tabs, cramped cart, hidden customer search, no visible rewards.

Redesign:
- **Top bar**: big customer chip (search-as-you-type, recent customers, "Walk-in" default) — always visible, not hidden behind a dialog. Shows loyalty status inline ("⭐ 240 pts · 1 free eyebrow available").
- **Left**: large category pills (icons + name), 2-row grid of service tiles with bigger touch targets, a sticky search box that filters across all categories.
- **Right (cart)**: clearer line items with inline qty stepper, per-item staff assignment dropdown, swipe/X to remove, running total in giant type, prominent "Apply free eyebrow" button when credits exist, prominent "Redeem 100 pts" when eligible.
- **Pay sheet**: 3 huge buttons (Cash / Card / Other), cash gives a quick-tender pad ($20, $40, $50, exact, custom) + change due; card shows mock terminal animation then success.
- Toast feedback on every add/remove; haptic-feel hover lift retained.
- Empty state explains "Tap any service to start a sale".

### 4. Better customer search + attach
- Live search (already partially there) upgraded to:
  - Searches name, phone (digits-only normalized), email.
  - Shows last visit, total spend, loyalty points in each result row.
  - "Recent customers" list when query is empty.
  - One-tap "New customer" inline form (name + phone only required).
- Once attached, customer chip shows rewards summary and a "View profile" link to `/customers/$id`.

### 5. Customer profile improvements
- `/customers/$id` page: contact info, lifetime spend, visit count, last 20 orders, loyalty balance, free-credit history, notes/allergies edit.

### 6. Verify
- Run a full test sale with multiple services (e.g. Eyebrow + Upper Lip + Full Face) on a real customer; confirm order, payment, loyalty trigger, and receipt all succeed.
- Run Supabase linter.

## Out of scope this iteration
Appointments/queue, staff scheduling, real Stripe Terminal, gift cards, memberships, CSV/PDF export — these stay for the next round per the original phasing.
