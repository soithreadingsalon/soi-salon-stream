## Goal
Add a shared-password "front door" before anyone can see the "Who's on shift?" worker-selection screen. Password: **`Soi@2026`**. Once entered on a device, it stays unlocked so staff don't have to re-enter it every visit.

## How it works
1. Visitor hits any page → server checks an encrypted `site-gate` cookie.
2. If not unlocked → redirected to `/gate` showing a single password field.
3. Correct password → cookie set (valid 30 days), redirected to the normal login/worker screen.
4. Wrong password → generic "Incorrect password" message. After 5 wrong attempts from the same IP in 10 minutes, further attempts are blocked for 15 minutes.
5. Existing PIN login flow is unchanged — this is an extra layer *in front* of it.

## Security details
- Password stored as a server-only secret (`SITE_PASSWORD` = `Soi@2026`), never shipped to the browser.
- Comparison is timing-safe (SHA-256 + `timingSafeEqual`) inside a server function.
- Session cookie is HttpOnly, Secure, SameSite=Lax, encrypted with a random `SESSION_SECRET` (auto-generated, never revealed).
- Cookie lifetime: **30 days** on the device that entered it.
- Public endpoints stay open: `/api/public/*` (website booking webhook) and `/gate` itself.

## Admin controls (added to Settings → Security)
- **"Lock all devices now"** button — rotates the session secret so every device is forced to re-enter the password. Use this if the password leaks or a device is lost.
- **"Change site password"** field — updates the stored password (admin/super_admin only).

## Files I'll create / change
- Migration: nothing new (secrets stored in env, not DB).
- New: `src/lib/gate.functions.ts` — `unlockSite`, `lockSite`, `isUnlocked` server functions.
- New: `src/routes/gate.tsx` — password entry screen (styled to match the login page).
- Edit: `src/routes/_authenticated/route.tsx` — add a `beforeLoad` check that redirects to `/gate` if the site-gate cookie is missing.
- Edit: `src/routes/login.tsx` (or wherever the worker-selection screen lives) — same gate check.
- Edit: `src/start.ts` — register `SESSION_SECRET` config (no new middleware needed).
- Optional: `src/routes/_authenticated/settings.tsx` — add "Lock all devices" + "Change password" section for admins.

## Confirm before I build
1. Password confirmed: **`Soi@2026`** — store it as-is? (I'd normally recommend something longer, but this is your call.)
2. Cookie lifetime **30 days** OK, or shorter (e.g. 7 days for tighter security)?
3. Should I add the admin "Lock all / Change password" panel now, or skip it for later?
