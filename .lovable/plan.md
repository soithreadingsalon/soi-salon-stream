## 1. Prepopulate Business profile (Settings → Business)

Seed `business_settings` with SOI's public info (one-time data update). User can edit anything afterwards.

| Field | Value |
|---|---|
| business_name | Style of India — SOI Threading & Salon |
| address | 190 Hamburg Tpke, Wayne, NJ 07470 |
| phone | 551-301-3894 |
| email | (leave blank — not public; admin to fill) |
| website | https://soithreadingandsalon.com |
| instagram | (admin to fill) |
| timezone | America/New_York |
| currency | USD |
| tax_rate | 0.06625 (NJ state rate) |
| tip_presets | 15, 18, 20 |
| receipt_footer | "Thank you for visiting Style of India — 190 Hamburg Tpke, Wayne NJ · (551) 301-3894" |
| hours | Mon–Sat 10:00–19:00, Sun 11:00–18:00 (editable JSON) |

## 2. NJ tax rule at POS

NJ exempts most personal salon services (threading, waxing, haircuts, facials) from sales tax but taxes retail goods and some services. Implementation:

- Keep `business_settings.tax_rate = 0.06625` as the rate.
- POS already multiplies tax only on lines where `taxable = true` — confirm this in `PosClient`/`order_items` math and fix if it taxes everything.
- Data update: set all current rows in `services` to `taxable = false` (salon services are exempt). Admin can flip individual items back to taxable in Settings → Services if needed (retail products, tanning, etc.).
- Show a small "Tax-exempt service (NJ)" badge next to non-taxable lines in the cart for transparency.

## 3. Customers & Services — full admin CRUD

Currently:
- Customers list has Add only — add Edit and Delete actions per row, gated by `super_admin`/`admin`.
- Services already has Edit/Delete — replace the `confirm()` flow with the new two-step delete dialog below.
- Add Edit dialog for Customers (name, phone, email, birthday, allergies, notes, marketing opt-in).

Visibility of Edit/Delete buttons: hidden for `cashier`/`manager`; visible only when `hasRole("super_admin","admin")`.

## 4. Two-step delete with soft-delete fallback

Reusable `<ConfirmDeleteDialog>` component used by Customers and Services:

```text
Step 1: "Are you sure you want to delete <name>?"
        [No] [Yes, delete]

Step 2 (after Yes):
        "Type DELETE in capitals to permanently remove this record.
         If you close this dialog, the record will be moved to the
         Recycle Bin and can be recovered later."
        [DELETE input]   [Cancel = soft-delete]   [Permanently delete = hard-delete]
```

Behaviour:
- **Cancel / close on Step 2** → soft delete: row is copied into `customers_deleted` / `services_deleted` then removed from the live table.
- **Type DELETE + submit** → hard delete: row is removed from the live table AND from the backup table (no recovery).
- Toast tells the admin which path happened.

## 5. Recycle Bin (Settings → new tab)

New `Recycle bin` tab inside `/settings` (admin-only) with two sub-sections: Customers and Services. Each row shows the original data, who deleted it, and when, plus actions:
- **Restore** — copy row back into live table (preserving original id), then delete from backup table.
- **Delete permanently** — hard delete from backup (single confirm).

## 6. Database changes

New migration (one call, awaiting your approval):

- Tables `customers_deleted` and `services_deleted` mirroring the original columns + `deleted_at timestamptz default now()`, `deleted_by uuid`.
- RLS: only `super_admin`/`admin` can `SELECT`/`INSERT`/`DELETE` on the backup tables.
- Two SECURITY DEFINER functions for atomic moves:
  - `soft_delete_customer(_id uuid)` / `restore_customer(_id uuid)` / `hard_delete_customer(_id uuid)`
  - `soft_delete_service(_id uuid)` / `restore_service(_id uuid)` / `hard_delete_service(_id uuid)`
  Each checks the caller has admin role via `has_any_role(auth.uid(), …)`.
- Data updates (separate insert tool call):
  - `UPDATE business_settings SET …` to prefill SOI info.
  - `UPDATE services SET taxable = false WHERE active = true` (NJ salon services exempt).

`orders`/`order_items` reference `customers.id` / `services.id` without a FK in the current schema, so deletes won't fail — historical orders will simply keep the snapshotted `service_name`/`customer_id` value and continue to render.

## 7. Files to add / change

- **DB migration** (new) — backup tables + RPC functions.
- **Data update** — seed business_settings + flip services.taxable.
- `src/components/ConfirmDeleteDialog.tsx` (new) — reusable two-step dialog.
- `src/routes/_authenticated/customers.tsx` — add Edit dialog, Delete button wired to the new dialog.
- `src/routes/_authenticated/services.tsx` — replace `confirm()` delete with the new dialog.
- `src/routes/_authenticated/settings.tsx` — add `Recycle bin` tab with `RecycleBinTab` component listing both backup tables + Restore / Permanently delete actions.
- `src/routes/_authenticated/-pos/PosClient.tsx` — verify tax math uses per-line `taxable` flag; add small "Tax-exempt (NJ)" hint.

## Open caveats

- "SOI" email/Instagram aren't on the public site — I'll leave blank and the admin can fill them in Settings.
- Hours are inferred from "Today: 10–7" plus typical salon hours; admin should confirm Sunday.
- If you later need true FK integrity between orders and customers/services, soft-delete handles it; hard-delete on an item referenced by old orders will still succeed because there's no FK today.
