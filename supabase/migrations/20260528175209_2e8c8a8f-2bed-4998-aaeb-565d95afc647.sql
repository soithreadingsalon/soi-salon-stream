
DROP POLICY IF EXISTS svc_admin_write ON public.services;
CREATE POLICY svc_manager_write ON public.services
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]));

DROP POLICY IF EXISTS cat_admin_write ON public.service_categories;
CREATE POLICY cat_manager_write ON public.service_categories
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]));
