
-- Revert view to security_invoker=on (Supabase prefers this)
ALTER VIEW public.workers_public SET (security_invoker = on);

-- Restore narrow anon SELECT policies, but only allow safe columns via column-level grants
CREATE POLICY worker_pins_public_list ON public.worker_pins
  FOR SELECT TO anon
  USING (active = true);

CREATE POLICY profiles_public_display ON public.profiles
  FOR SELECT TO anon
  USING (id IN (SELECT user_id FROM public.worker_pins WHERE active = true));

-- Column-level grants restrict which fields anon may read
REVOKE SELECT ON public.worker_pins FROM anon;
GRANT SELECT (user_id, display_name, active) ON public.worker_pins TO anon;

REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, full_name) ON public.profiles TO anon;
