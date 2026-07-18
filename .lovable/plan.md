## Diagnosis

You confirmed the same cashier account renders the sidebar correctly on mobile Safari but shows an empty sidebar on desktop Chrome and Edge. That rules out an RLS/permission problem (the server is returning the same data to every browser for the same user) and points at two client-side causes I can address:

1. **Stale JS bundle cached by Chrome/Edge.** Chrome and Edge cache the built JS/HTML far more aggressively than iOS Safari. When we changed the permission model in earlier turns, Chrome/Edge kept serving an older bundle whose `usePermissions` query targeted a table shape that now returns nothing for cashiers — so the sidebar filter drops every item. Safari mobile fetched fresh and works.
2. **No fallback when `role_permissions` returns `[]`.** Today `AppSidebar` only renders an item if `can(permission)` is true or the user is admin. If the query fails, is blocked by a browser extension, or is served from a stale cache, cashiers see nothing — no error, no default items, no way to recover.

## Plan (frontend only, no data changes)

### 1. Force Chrome/Edge to drop the stale bundle

- Add `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">` plus `Pragma: no-cache` and `Expires: 0` to the document head in `src/routes/__root.tsx`. This applies only to the HTML shell — hashed JS/CSS assets stay cache-friendly, but the HTML that references them is always revalidated, so every deploy invalidates cleanly on Chrome/Edge without hurting Safari.
- Bump the app so the next load ships fresh JS to every browser regardless of what they cached.

### 2. Make the sidebar resilient so an empty permission list never yields an empty menu

In `src/hooks/use-permissions.tsx`:
- Surface the query's `isLoading` and `isError` state.
- Add a **role-based fallback map** used when the query hasn't loaded yet OR returned zero rows OR errored. The fallback mirrors the intended defaults:
  - `cashier` → `pos.use`, `customers.view`, `appointments.checkin`, `reports.today_only`
  - `staff` → `pos.use`, `appointments.checkin`
  - `manager` → everything except admin-only Settings
- `can(key)` returns true when either the DB rows grant it OR the fallback for one of the user's roles grants it. Admins remain unaffected (they already short-circuit to true).

In `src/components/AppSidebar.tsx`:
- While `rolesLoading` or permissions are loading, render a lightweight skeleton (3–4 placeholder rows) instead of an empty list, so the user never sees a blank sidebar mid-load.
- Keep the current visibility logic; it will now receive the fallback-augmented `can()`.

### 3. Verify

- Reload the preview in Chrome and Edge (hard reload once to clear the currently-cached bundle), sign in as Jinal / Priyanka / Sejal, confirm menu items appear.
- Confirm admin (SOI) still sees the full menu including Settings.
- Confirm mobile Safari still works.

## Notes

- No database migration, no RLS change, no changes to customer / order / payment data.
- The fallback is intentionally a **safety net**, not the source of truth: as soon as `role_permissions` loads, the DB rows take precedence. If you later revoke a permission in Settings, that revocation still wins for granted rows; the fallback only fills in when the query returns nothing.
