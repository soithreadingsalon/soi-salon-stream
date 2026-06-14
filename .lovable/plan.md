## Rotate the website booking secret

1. Generate a fresh cryptographically-random 64-character hex secret locally.
2. Update the existing `WEBSITE_BOOKING_SECRET` in Lovable Cloud secrets with that value (used by `/api/public/website-appointment` to verify HMAC signatures).
3. Reply with the two values for you to paste into the website's secret form:
   - `POS_WEBHOOK_URL` → `https://pos.soithreadingandsalon.com/api/public/website-appointment`
   - `BOOKING_INTEGRATION_SECRET` → the freshly generated string

No code changes — the endpoint and verification logic already exist. Only the secret value is rotated.

After you paste it on the website side, send one test booking; it should appear in Appointments. If signature verification fails, the endpoint returns 401 and we re-check the secret matches on both sides.