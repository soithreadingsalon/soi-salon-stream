
-- 1. Recreate workers_public as SECURITY INVOKER view
DROP VIEW IF EXISTS public.workers_public;
CREATE VIEW public.workers_public
  WITH (security_invoker = true) AS
SELECT wp.user_id AS id,
       COALESCE(wp.display_name, p.full_name, split_part(p.email, '@', 1)) AS display_name,
       wp.active
FROM public.worker_pins wp
LEFT JOIN public.profiles p ON p.id = wp.user_id
WHERE wp.active = true;
GRANT SELECT ON public.workers_public TO anon, authenticated;

-- 2. Revoke public/anon EXECUTE on internal SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.award_loyalty_on_order() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_daily_backups() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_appointment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_appointment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hard_delete_customer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.hard_delete_service(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_customer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_service(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_customer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_service(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reset_services_to_official_menu() FROM PUBLIC, anon;

-- 3. business_settings: keep read-all policy, but revoke sensitive column SELECT
REVOKE SELECT (override_pin_hash, override_pin_salt) ON public.business_settings FROM authenticated, anon;
-- service_role retains full access via existing GRANT ALL

-- 4. worker_pins: revoke pin_hash / pin_salt from anon (and authenticated non-admin path)
REVOKE SELECT (pin_hash, pin_salt) ON public.worker_pins FROM anon, authenticated;
-- Admins go through worker_pins_admin_all (ALL) which is unaffected by column REVOKE at role level;
-- verify_worker_pin uses SECURITY DEFINER and does not need per-role column select.

-- 5. loyalty_accounts / loyalty_transactions: restrict SELECT to staff roles
DROP POLICY IF EXISTS loyalty_read_all ON public.loyalty_accounts;
CREATE POLICY loyalty_read_staff ON public.loyalty_accounts
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role,'cashier'::app_role]));

DROP POLICY IF EXISTS loyalty_tx_read_all ON public.loyalty_transactions;
CREATE POLICY loyalty_tx_read_staff ON public.loyalty_transactions
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role,'cashier'::app_role]));

-- 6. orders / order_items: restrict SELECT (also constrains realtime broadcasts)
DROP POLICY IF EXISTS ord_read_all ON public.orders;
CREATE POLICY ord_read_staff ON public.orders
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role,'cashier'::app_role]));

DROP POLICY IF EXISTS oi_read_all ON public.order_items;
CREATE POLICY oi_read_staff ON public.order_items
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role,'cashier'::app_role]));
