## Why workers don't show up

The Workers tab in `/settings` queries:

```ts
supabase.from("worker_pins").select("…, profiles:user_id(full_name, email)")
```

That embedded select needs a foreign key from `worker_pins.user_id` → `public.profiles.id`. The actual FK on `worker_pins.user_id` points to `auth.users`, not `public.profiles`, so PostgREST rejects the join and the query throws — the table renders empty even though the worker (e.g. "Jinal") exists in the database.

## Fix

In `src/routes/_authenticated/settings.tsx`, replace the embedded join with two separate queries that are merged on the client:

1. `select user_id, display_name, active, created_at from worker_pins order by created_at desc`
2. `select id, full_name, email from profiles where id in (…ids from step 1)`
3. Build a `Map<userId, profile>` and attach `full_name` / `email` to each row.

Render `display_name ?? profile.full_name` and `profile.email` exactly as today. No schema change, no RLS change (admin policies already allow both reads).

## Files touched

- `src/routes/_authenticated/settings.tsx` — rewrite the `workers_admin` `useQuery` only; table markup stays the same.

## Out of scope

- Touching RLS, adding a FK to `profiles`, or changing the login flow.
