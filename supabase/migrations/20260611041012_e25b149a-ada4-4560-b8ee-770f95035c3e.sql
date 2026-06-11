ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS override_pin_hash text,
  ADD COLUMN IF NOT EXISTS override_pin_salt text;

-- Seed default PIN "1987" on the first/only business_settings row if no PIN set yet.
-- salt = '0001987seed' (fixed for repeatability; immediately overridable by admin in Settings)
UPDATE public.business_settings
SET override_pin_salt = '0001987seed',
    override_pin_hash = encode(extensions.digest('0001987seed' || '1987', 'sha256'), 'hex')
WHERE override_pin_hash IS NULL;