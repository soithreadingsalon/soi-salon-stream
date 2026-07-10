
-- 1) Revoke EXECUTE from public/anon/authenticated on functions that should not be user-callable.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_loyalty_on_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_daily_backups() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_worker_pin(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.soft_delete_appointment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_appointment(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Realtime: enforce RLS on realtime.messages and only allow signed-in users to subscribe.
--    Individual tables published to Realtime still enforce their own RLS on row payloads.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_can_subscribe" ON realtime.messages;
CREATE POLICY "authenticated_can_subscribe"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);
