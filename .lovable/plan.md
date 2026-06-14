## 1. Add "Next week" quick filter

In `src/routes/_authenticated/appointments.tsx`:

- Extend `DatePreset` type with `"next-week"`.
- Add helpers `nextWeekStartStr()` / `nextWeekEndStr()` (Mon–Sun of the following week, matching the existing `weekEndStr` convention).
- In `applyPreset`, handle `"next-week"` → set `from`/`to` to next week's range.
- Add a new `{presetBtn("next-week", "Next week")}` button between "This week" and "All dates".

No server / schema changes.

## 2. Delete today's test appointments

Delete the 5 appointments created today (the ones I created while testing the website webhook + the "est" row), via a migration since the appointments table is delete-protected by RLS:

```
d556dda4-6b55-4517-a303-50dd2d196bb8  est                  production/manual
2ca7e634-e7eb-4125-99af-79a1608ceeda  Test1                test/website
71dc3334-1d8b-4a14-9ead-bddb9fc11081  Test                 test/website
7602a9a5-0bf0-4022-bd2f-96a2a00d4a46  Vansh                test/website
70275cd7-9645-4e0e-8ea7-add701fdd515  Lovable Test Booking test/website
```

One-shot SQL: `DELETE FROM public.appointments WHERE id IN (...)` for exactly those 5 IDs. No schema change, no other tables touched.

Please confirm — especially that "Vansh" and "est" are test rows you want removed (not real bookings).
