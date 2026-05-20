## Plan

### 1. POS — remove duplicate Gift card / Membership entry

The code only defines **one** pair of Gift card + Membership buttons (in the category chip row of `PosClient.tsx`, lines 413–420). I couldn't find a second pair in the source.

To resolve this correctly I'll:
- Open the running POS page in the browser tool, take a screenshot, and locate the second (broken) Gift / Membership entry.
- Likely candidates: a service tile auto-created in some category, a leftover row in the cart's loyalty/quick-actions strip, or a chip rendered both at the top of the catalog and inside the cart panel on tablet.
- Delete the one that doesn't open the working `GiftCardDialog` / `MembershipDialog`, keeping the gold-ringed pair next to the category chips (those are wired to `setGiftOpen` / `setMemOpen` and known good).

If after inspection the only entries on screen are the working ones (i.e. you're seeing one in the catalog area + one in the side cart that does the same thing), I'll remove the cart-side ones so there's a single source of truth above the service grid.

### 2. Admin Shifts — full timestamped log + multiple clock-in/out per day

Right now the admin Shifts tab (`settings.tsx` → `ShiftsTab`) shows only a clock-in time + clock-out time + total hours per row, and dates render bare ISO. Each `worker_shifts` row is already one clock-in/out pair, so multiple in/outs already become multiple rows — but they're not grouped or formatted.

Changes:
- Format every timestamp as **`MMM D, YYYY · h:mm:ss A`** (12-hour with AM/PM) for both `clock_in_at` and `clock_out_at`, in the admin Shifts table, in My Sales hours calc display, and in the ClockWidget tooltip.
- Group rows by **worker → date**, with a collapsible section per worker/day listing every clock-in/out pair in chronological order plus a per-day subtotal and a per-worker grand total for the date range.
- Add a "Sessions" count column (number of clock-in/out pairs that day) so multiple sessions are obvious at a glance.
- Add per-worker filter dropdown next to the from/to dates.
- Add **Export Excel** + **Print** buttons reusing the existing `reportExport` helper. Excel workbook sheets:
  - **Summary**: total hours per worker for the range.
  - **Sessions**: every single clock-in/out row with worker, date, clock in (AM/PM), clock out (AM/PM), hours, status, adjusted flag, admin notes.
- Print uses the existing `print-doc` stylesheet from the last turn (bigger fonts, repeating headers).

### 3. Clock-in widget — show current date & time on login

`ClockWidget` (top bar) currently shows just elapsed time once a shift is open. Update:
- Always render the **live clock**: `Wed, May 20, 2026 · 3:42:18 PM`, ticking every second, visible whether or not the worker is clocked in.
- When clocked in, also show "On shift since {clock-in time AM/PM} · {elapsed}".
- Toast on clock-in/out includes the timestamp (e.g. "Clocked in at 3:42 PM").

### 4. Centralize timestamp formatting

Create `src/lib/datetime.ts` with helpers `fmtDateTime(iso)`, `fmtTime(iso)`, `fmtDate(iso)` using `en-US` 12-hour locale options. Use across ClockWidget, ShiftsTab, my-sales, reports, ReceiptDialog so AM/PM is consistent everywhere.

### Out of scope
- No DB schema changes — `worker_shifts` already has everything we need (`clock_in_at`, `clock_out_at`, `worker_id`, `worker_name`, `total_hours`, `status`, `is_adjusted`, `admin_notes`).
- No changes to POS checkout flow or reports KPIs.
