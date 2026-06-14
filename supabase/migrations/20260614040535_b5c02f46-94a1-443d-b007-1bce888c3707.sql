
-- 1) Make workers_public usable by anon without needing RLS on underlying tables
ALTER VIEW public.workers_public SET (security_invoker = off);
GRANT SELECT ON public.workers_public TO anon, authenticated;

-- 2) Remove anonymous read access to credential-bearing tables
DROP POLICY IF EXISTS worker_pins_public_list ON public.worker_pins;
DROP POLICY IF EXISTS profiles_public_display ON public.profiles;

-- 3) Audit log integrity: enforce user_id = auth.uid()
DROP POLICY IF EXISTS audit_insert ON public.audit_logs;
CREATE POLICY audit_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 4) Restrict customers SELECT to staff roles
DROP POLICY IF EXISTS cust_read_all ON public.customers;
CREATE POLICY cust_read_staff ON public.customers
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','manager','cashier']::app_role[]));

-- 5) Restrict payments SELECT to staff roles
DROP POLICY IF EXISTS pay_read_all ON public.payments;
CREATE POLICY pay_read_staff ON public.payments
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','manager','cashier']::app_role[]));

-- 6) Hide override PIN hash/salt from regular authenticated reads.
--    Admin-only paths read these via supabaseAdmin (service_role), which is unaffected.
REVOKE SELECT ON public.business_settings FROM authenticated;
GRANT SELECT (
  id, business_name, address, phone, email, website, instagram, google_link,
  hours, tax_rate, tip_presets, currency, timezone, receipt_footer,
  refund_policy, logo_url, updated_at, created_at,
  cash_drawer_enabled, cash_drawer_connection_type,
  cash_drawer_printer_ip, cash_drawer_printer_port
) ON public.business_settings TO authenticated;

-- 7) Revoke EXECUTE on SECURITY DEFINER functions from anon
REVOKE EXECUTE ON FUNCTION public.award_loyalty_on_order() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_services_to_official_menu() FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_appointment(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_daily_backups() FROM anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_appointment(uuid) FROM anon;

-- 8) Force re-setup of override PIN if it still matches the seeded default
UPDATE public.business_settings
SET override_pin_hash = NULL,
    override_pin_salt = NULL
WHERE override_pin_salt = '0001987seed';
