
REVOKE EXECUTE ON FUNCTION public.verify_worker_pin(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_worker_pin(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_worker_pin(uuid, text) FROM anon;
