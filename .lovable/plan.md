## Plan

### 1. Wipe all test data (migration)

Single migration that `TRUNCATE ... RESTART IDENTITY CASCADE` on transactional tables only — preserves services, categories, business settings, profiles, roles, and worker pins.

Tables wiped:
- `orders`, `order_items`, `payments` (resets `order_number`)
- `gift_cards`, `memberships`
- `loyalty_accounts`, `loyalty_transactions`
- `customers`, `customers_deleted`
- `worker_shifts`
- `audit_logs`

Current data that will be deleted: 2 orders, 5 line items, 2 payments, 1 customer, 1 membership, 1 shift, 1 loyalty account.

### 2. Excel export on Reports (admin)

`src/routes/_authenticated/reports.tsx`:
- Add `bun add xlsx`.
- New **Export Excel** button next to CSV/Print.
- Workbook with sheets: **Summary** (KPIs), **Orders**, **Payments by method**, **Top services**.
- Currency number format on $ columns, bold headers, sensible column widths.
- Filename `soi-report-{from}-to-{to}.xlsx`.

### 3. Per-worker self-serve report

Rebuild `src/routes/_authenticated/my-sales.tsx` so every signed-in worker can pull their own numbers:
- Date range with presets (Today / Last 7d / Last 30d / Custom).
- KPIs filtered to `cashier_id = me`: orders, gross, tips, average ticket, hours worked (from `worker_shifts`), by-method, top services.
- **Download Excel** and **Download CSV** buttons (same sheet structure, scoped to self).
- Print button using the same shared print stylesheet as admin Reports.

Uses existing RLS — no schema or policy changes needed.

### 4. Print layout polish (admin Reports + My Sales)

The current print output uses screen sizes and relies on `print:hidden`/`print:p-0` only. Rework:

- Add a dedicated `@media print` block in `src/styles.css`:
  - Base font bumped to ~12pt; table cells 11pt; KPI labels 9pt; H1 18pt.
  - `@page { size: auto; margin: 12mm; }` for paper, plus a narrow variant we toggle for 80mm receipt printer.
  - Force black-on-white, remove shadows/borders we don't need, keep gold accent on totals.
  - `table { width: 100%; border-collapse: collapse; } th, td { padding: 6px 8px; border-bottom: 1px solid #ccc; }`.
  - `thead { display: table-header-group; }` so headers repeat across pages; `tr, .kpi { page-break-inside: avoid; }`.
  - Hide filter card, sidebar, nav, buttons via existing `print:hidden` + new `.no-print` utility.
- Add a small print header injected only when printing: business name + address + phone (from `business_settings`) + report title + date range + generated-at timestamp + cashier name (for My Sales).
- Honor the existing cash-drawer / receipt printer width setting (`business_settings.cash_drawer_*`) only as a toggle: a **Print (Receipt 80mm)** secondary option that sets `@page { size: 80mm auto }` via a body class — main Print stays full-page Letter. (Reports are too wide for 58mm, so we don't expose that.)
- Right-align numeric columns; ensure totals row is bold; ensure no horizontal overflow at print width.

### Out of scope
- No POS checkout changes.
- No new tables, RLS, or server functions.
- No changes to receipt printing in `ReceiptDialog`.

### Confirmation needed
Confirm I should proceed with the data wipe in step 1 — it's irreversible.
