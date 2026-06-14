-- Restore public worker list on login screen.
-- The workers_public view was switched to security_invoker, which made it
-- inherit anon's (now revoked) access to profiles/worker_pins and returned 0 rows.
-- Switch it back to definer semantics so only the safe columns it selects are exposed.
ALTER VIEW public.workers_public SET (security_invoker = off);
GRANT SELECT ON public.workers_public TO anon, authenticated;