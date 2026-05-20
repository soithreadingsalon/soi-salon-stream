## Goal
Make the POS screen fully usable from the keyboard and meet baseline accessibility standards, so a front-desk worker can ring up a sale without touching the mouse and assistive tech can navigate the screen properly.

## Keyboard shortcuts (POS)
Add a single global key handler on the POS page (active only when no input/textarea has focus, except where noted):

- `/` or `Ctrl/Cmd+K` → focus the service search box
- `1`…`9` → switch to the Nth category chip
- `G` → open Gift Card dialog
- `M` → open Membership dialog
- `C` → open Customer picker
- `Enter` (with at least 1 cart item) → open Pay dialog
- In Pay dialog: `1` Cash, `2` Card, `3` Zelle, `Esc` close
- `Esc` → close any open dialog/sheet (already handled by Radix)
- `+` / `-` on a focused cart row → increase / decrease quantity
- `Delete` / `Backspace` on a focused cart row → remove item
- `Shift+?` → open a small "Keyboard shortcuts" help popover

Also: make the catalog service tiles real `<button>` elements with `Enter`/`Space` activation, and ensure `Tab` order is: customer bar → search → categories → service grid → cart items → totals → pay buttons.

## Accessibility fixes
- Add `aria-label` to all icon-only buttons (qty +/-, remove, close, clear customer, etc.).
- Give every dialog/sheet a `DialogTitle` (add `sr-only` titles where currently missing) so screen readers announce them.
- Add visible `:focus-visible` ring to the category chips, service tiles, and cart-row controls (currently rely on default which is suppressed by custom button styles).
- Use semantic `<button type="button">` instead of `<div onClick>` for service tiles and category chips (verify, fix any that aren't).
- Replace `h-[calc(100vh-3.5rem)]` with `h-[calc(100dvh-3.5rem)]` so the mobile viewport accessibility heuristic passes.
- Tap targets: ensure qty +/- buttons are ≥ 44×44 on touch (`min-h-11 min-w-11`).
- Announce cart updates with an `aria-live="polite"` region (e.g. "Eyebrow added, 2 items in cart, total $24.00") so screen-reader users get feedback when keyboard-adding items.
- Add `aria-label="Cart"` to the cart panel and `role="list"` / `role="listitem"` to cart rows.
- Search input: add an explicit `<label htmlFor>` (currently `sr-only`-less placeholder only).
- Make sure the "Edit with Lovable" badge — already hidden — does not steal focus order anywhere.

## Discoverability
Add a small `?` icon button in the POS top bar that opens a Shortcuts dialog listing every binding above. This doubles as documentation for staff.

## Files to touch
- `src/routes/_authenticated/-pos/PosClient.tsx` — global key handler, aria labels, focus styles, button semantics, live region, shortcuts dialog trigger.
- `src/routes/_authenticated/-pos/ReceiptDialog.tsx` — verify `DialogTitle` and `Esc` close.
- New: `src/routes/_authenticated/-pos/ShortcutsDialog.tsx` — the help popover.
- `src/styles.css` — a single shared `.pos-focus-ring` utility (or reuse `focus-visible:ring-2 ring-gold`) if needed.

## Out of scope
- No business-logic changes (pricing, payments, DB writes untouched).
- No changes to non-POS routes in this pass (can extend the same patterns to Reports / Customers later if you want).
