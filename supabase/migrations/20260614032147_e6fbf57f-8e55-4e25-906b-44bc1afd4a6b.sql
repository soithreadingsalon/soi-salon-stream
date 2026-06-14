DELETE FROM public.role_permissions WHERE role='manager' AND permission_key='appointments.assign';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='appointments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments';
  END IF;
END $$;

ALTER TABLE public.appointments REPLICA IDENTITY FULL;