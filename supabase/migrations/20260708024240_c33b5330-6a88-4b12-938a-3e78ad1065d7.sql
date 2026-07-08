
DROP POLICY IF EXISTS gc_read_all ON public.gift_cards;
CREATE POLICY gc_read_staff ON public.gift_cards
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role,'cashier'::app_role]));

DROP POLICY IF EXISTS mem_read_all ON public.memberships;
CREATE POLICY mem_read_staff ON public.memberships
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role,'cashier'::app_role]));

DROP POLICY IF EXISTS rp_read_all ON public.role_permissions;
CREATE POLICY rp_read_admin ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]));
