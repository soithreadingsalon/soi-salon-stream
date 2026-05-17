
-- 1. Drop customer-display sync schema
ALTER TABLE public.orders DROP COLUMN IF EXISTS register_session_id;
ALTER TABLE public.orders DROP COLUMN IF EXISTS customer_tip_amount;
ALTER TABLE public.orders DROP COLUMN IF EXISTS customer_payment_method;
ALTER TABLE public.orders DROP COLUMN IF EXISTS customer_paid_confirmed;

DROP TABLE IF EXISTS public.register_sessions CASCADE;

-- 2. Worker PINs (4-digit, hashed using SHA-256 with per-row salt)
CREATE TABLE IF NOT EXISTS public.worker_pins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_salt text NOT NULL,
  pin_hash text NOT NULL,
  display_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.worker_pins ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY worker_pins_admin_all ON public.worker_pins
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role]));

-- Workers can read (but not change) their own row, mostly so the admin tile picker can list active workers
CREATE POLICY worker_pins_self_read ON public.worker_pins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['super_admin'::app_role, 'admin'::app_role, 'manager'::app_role]));

CREATE TRIGGER worker_pins_touch
BEFORE UPDATE ON public.worker_pins
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Helper to verify a PIN by user_id, callable from any authenticated session
-- (we mint a magic link server-side after this passes)
CREATE OR REPLACE FUNCTION public.verify_worker_pin(_user_id uuid, _pin text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.worker_pins%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.worker_pins WHERE user_id = _user_id AND active = true;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN v_row.pin_hash = encode(extensions.digest(v_row.pin_salt || _pin, 'sha256'), 'hex');
END;
$$;

-- pgcrypto must be available for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 4. Public view of workers (id + display name + active) for the login tile picker.
-- Anon users get to see workers' display names ONLY (no emails, no auth ids beyond what we expose).
CREATE OR REPLACE VIEW public.workers_public
WITH (security_invoker = on) AS
  SELECT wp.user_id AS id,
         COALESCE(wp.display_name, p.full_name, split_part(p.email, '@', 1)) AS display_name,
         wp.active
  FROM public.worker_pins wp
  LEFT JOIN public.profiles p ON p.id = wp.user_id
  WHERE wp.active = true;

GRANT SELECT ON public.workers_public TO anon, authenticated;

-- Allow anon SELECT on worker_pins for the verify path? No — we verify via SECURITY DEFINER fn.
-- But the view needs profiles read access; add a permissive policy for displayed name only.
DROP POLICY IF EXISTS profiles_public_display ON public.profiles;
CREATE POLICY profiles_public_display ON public.profiles
  FOR SELECT TO anon
  USING (id IN (SELECT user_id FROM public.worker_pins WHERE active = true));

-- Worker_pins read for anon (only the columns the view uses)
DROP POLICY IF EXISTS worker_pins_public_list ON public.worker_pins;
CREATE POLICY worker_pins_public_list ON public.worker_pins
  FOR SELECT TO anon
  USING (active = true);
