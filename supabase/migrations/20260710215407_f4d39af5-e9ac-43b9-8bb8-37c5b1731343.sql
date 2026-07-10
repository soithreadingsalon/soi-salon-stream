
-- Restrict SELECT on override PIN credential columns to service_role only.
REVOKE SELECT (override_pin_hash, override_pin_salt) ON public.business_settings FROM authenticated, anon, PUBLIC;
-- Explicitly grant SELECT on remaining safe columns to authenticated so app reads keep working.
GRANT SELECT (id, business_name, address, phone, email, website, instagram, google_link, hours, tax_rate, tip_presets, currency, timezone, receipt_footer, refund_policy, logo_url, updated_at, created_at, cash_drawer_enabled, cash_drawer_connection_type, cash_drawer_printer_ip, cash_drawer_printer_port)
ON public.business_settings TO authenticated;
