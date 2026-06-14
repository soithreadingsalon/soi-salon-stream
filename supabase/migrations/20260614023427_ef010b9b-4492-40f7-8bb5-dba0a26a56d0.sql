ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';
CREATE INDEX IF NOT EXISTS appointments_environment_idx ON public.appointments(environment);