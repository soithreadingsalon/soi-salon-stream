
-- 1) Fix profiles PII exposure to anon: restrict columns anon can read
DROP POLICY IF EXISTS profiles_public_display ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, full_name) ON public.profiles TO anon;
CREATE POLICY profiles_public_display ON public.profiles
  FOR SELECT TO anon
  USING (id IN (SELECT user_id FROM public.worker_pins WHERE active = true));

-- 2) Fix realtime broadcast open-topic subscription
DROP POLICY IF EXISTS authenticated_can_subscribe ON realtime.messages;
CREATE POLICY authenticated_can_subscribe ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    -- Allow only topics scoped to app-internal channels we control.
    -- Users may subscribe to their own user channel or public app channels.
    realtime.topic() LIKE 'public:%'
    OR realtime.topic() = concat('user:', auth.uid()::text)
    OR realtime.topic() IN ('appointments', 'orders_admin')
  );

-- 3) Switch has_role / has_any_role to SECURITY INVOKER so signed-in users
-- executing them no longer trip the "SECURITY DEFINER executable" linter.
-- Break user_roles policy recursion by scoping self-read to own row only;
-- admin management of user_roles happens via service-role server functions.
DROP POLICY IF EXISTS user_roles_self_read ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_write ON public.user_roles;

CREATE POLICY user_roles_self_read ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No client-side write policy: role changes must go through server functions
-- using the service role (supabaseAdmin), which bypasses RLS.

ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;
ALTER FUNCTION public.has_any_role(uuid, public.app_role[]) SECURITY INVOKER;
