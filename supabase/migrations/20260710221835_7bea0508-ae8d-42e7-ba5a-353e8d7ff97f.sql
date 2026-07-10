
-- Revoke EXECUTE from anon/authenticated/PUBLIC on SECURITY DEFINER functions
-- that are wrapped by role-checked server functions or are trigger/maintenance only.

REVOKE EXECUTE ON FUNCTION public.hard_delete_customer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_customer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_customer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hard_delete_service(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_service(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_service(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_services_to_official_menu() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_appointment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_appointment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_worker_pin(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_loyalty_on_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_daily_backups() FROM PUBLIC, anon, authenticated;

-- Ensure service_role keeps EXECUTE on wrapped functions (defensive; usually granted by default).
GRANT EXECUTE ON FUNCTION public.hard_delete_customer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_customer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_customer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.hard_delete_service(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_service(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_service(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_services_to_official_menu() TO service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_appointment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_appointment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_worker_pin(uuid, text) TO service_role;

-- has_role and has_any_role remain executable by authenticated because they are
-- referenced inline by RLS policies across many tables; revoking would break RLS.
