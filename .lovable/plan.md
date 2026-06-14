# Import existing website appointments

You will upload a CSV or JSON export from soithreadingandsalon.com. I'll build a one-time importer in the POS that creates customer records and backfills historical appointments, defaulting marketing opt-in to true.

## 1. Upload format

I'll accept any of these column/key names (case-insensitive, extra columns ignored):

- **Full Name** — `full_name` / `name` / `customer_name` (required)
- **Phone** — `phone` / `phone_number` (required)
- **Email** — `email`
- **Service Category** — `service_category` / `category` (matched to existing categories by name or slug)
- **Service** — `service` / `service_name`
- **Date** — `appointment_date` / `date` (any parseable format)
- **Time** — `appointment_time` / `time`
- **Notes** — `notes` / `message`
- **External ID** — `id` / `booking_id` (used for dedup so re-runs don't duplicate)

Rows missing date/time → customer-only (still imported into Customers tab).

## 2. Importer UI

New **Import from Website** button on the Customers tab (admin/manager only):
- Drag-drop CSV or JSON file
- Preview first 10 rows + column mapping confirmation
- "Run import" → shows progress + summary (created / merged / skipped / errors)
- Imported customers tagged with `notes` prefix `[website import]` so they're filterable
- Marketing opt-in defaults to true

## 3. Server logic

New server fn `importWebsiteAppointments({ rows })`:
- For each row: resolve `service_category_id` (lookup by slug/name), then call existing `upsertCustomerFromAppointment` (phone-tail → email match, fills blanks, creates if new).
- If date+time present: also insert an `appointments` row with `booking_source='website'`, `external_source='website_import'`, `external_booking_id=<row id>`, `environment='production'`, `status='completed'` (historical). Dedup on `(external_source, external_booking_id, environment)` — re-running is safe.
- Returns counts: `{ customers_created, customers_merged, appointments_created, appointments_skipped, errors:[{row, message}] }`.

## 4. Files

- `src/lib/website-import.functions.ts` (new) — `importWebsiteAppointments` server fn, admin/manager only
- `src/routes/_authenticated/customers.tsx` — add **Import from Website** button + dialog with file picker, preview, run, summary
- No schema changes (existing `customers` + `appointments` columns cover everything; dedup already supported via `external_booking_id`)

## Out of scope
- Live sync with the website (this is a one-time historical pull — the existing webhook keeps new bookings flowing in)
- Scraping the public site

Please upload the export file when ready (CSV preferred). If you share a sample first, I can confirm the column mapping before building.
