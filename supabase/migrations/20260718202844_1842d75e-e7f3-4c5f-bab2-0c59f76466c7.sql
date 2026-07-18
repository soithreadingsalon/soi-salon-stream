DROP POLICY IF EXISTS "rp_read_admin" ON public.role_permissions;
CREATE POLICY "rp_read_authenticated" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (true);