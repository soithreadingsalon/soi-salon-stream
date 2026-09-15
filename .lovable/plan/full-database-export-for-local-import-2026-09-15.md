# Full Database Export for Local Import

Produce a complete, self-contained export of the salon system's database — structure plus every row — that can be loaded into a fresh local project.

## What you get

A single downloadable folder of files in Files:

1. `soi-schema.sql` — the full structure: all tables, types, access rules, functions, triggers, and permission grants, in the correct creation order.
2. `soi-data.sql` — every row from every table as insert statements, ordered so linked records load without errors.
3. `soi-full-import.sql` — structure and data combined into one file you can run in a single step.
4. `csv/<table>.csv` — one spreadsheet-friendly file per table (25 tables).
5. `README.md` — step-by-step import instructions and notes on staff login accounts.

## How the export is built

- Structure comes from the project's 32 recorded change files, consolidated and cleaned into one ordered script (extensions, enum types, tables, grants, row-level rules, functions, triggers, views).
- Data is read table by table, with values properly escaped, timestamps preserved, and inserts written parent-before-child (categories before services, orders before order items, and so on).
- Sequence counters (such as the order number counter) are reset at the end so new records continue from the right number.

## Important notes covered in the README

- Staff login accounts live in the authentication system, not in these tables. The export includes the linked profile and role rows, but each person must be re-created in the new project's auth users, then their ID matched. The README explains this.
- Password/PIN hashes for the salon gate and staff PINs are included as stored; they are one-way hashes, not readable passwords.
- The export contains real customer, appointment, order, and payment records. It is sensitive — the README flags that.

## Technical details

- Export runs read-only against the live database via `psql`/`SELECT`; nothing in the live project changes.
- Row counts per table are verified after generation, and the combined SQL is syntax-checked before delivery.
- Output written to `/mnt/documents/soi-export/`.
