
DROP VIEW IF EXISTS public.workers_public;
DROP FUNCTION IF EXISTS public.get_workers_public();

CREATE VIEW public.workers_public
WITH (security_invoker = true) AS
SELECT wp.user_id AS id,
       COALESCE(wp.display_name, 'Worker') AS display_name,
       wp.active
FROM public.worker_pins wp
WHERE wp.active = true;

GRANT SELECT (user_id, display_name, active) ON public.worker_pins TO anon, authenticated;
GRANT SELECT ON public.workers_public TO anon, authenticated;
