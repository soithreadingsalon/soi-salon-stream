
REVOKE ALL ON FUNCTION public.soft_delete_customer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_customer(uuid)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hard_delete_customer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_service(uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_service(uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hard_delete_service(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_customer(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_customer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_service(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_service(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_service(uuid)  TO authenticated;
