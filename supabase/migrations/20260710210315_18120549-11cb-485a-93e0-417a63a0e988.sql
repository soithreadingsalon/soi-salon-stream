
DROP VIEW IF EXISTS public.workers_public;

CREATE OR REPLACE FUNCTION public.get_workers_public()
RETURNS TABLE (id uuid, display_name text, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wp.user_id AS id,
         COALESCE(wp.display_name, 'Worker') AS display_name,
         wp.active
  FROM public.worker_pins wp
  WHERE wp.active = true
  ORDER BY display_name;
$$;

REVOKE ALL ON FUNCTION public.get_workers_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workers_public() TO anon, authenticated;

CREATE OR REPLACE VIEW public.workers_public
WITH (security_invoker = true) AS
SELECT id, display_name, active FROM public.get_workers_public();

GRANT SELECT ON public.workers_public TO anon, authenticated;
