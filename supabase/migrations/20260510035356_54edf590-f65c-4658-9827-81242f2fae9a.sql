ALTER TABLE public.register_sessions
  ADD COLUMN IF NOT EXISTS live_cart jsonb NOT NULL DEFAULT '{}'::jsonb;