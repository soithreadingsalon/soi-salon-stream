
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission_key)
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL    ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY rp_read_all ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY rp_admin_write ON public.role_permissions
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]));

-- Seed defaults
INSERT INTO public.role_permissions (role, permission_key, allowed) VALUES
  ('manager','pos.use',true),
  ('manager','pos.refund',true),
  ('manager','giftcards.sell',true),
  ('manager','services.edit',true),
  ('manager','categories.edit',true),
  ('manager','customers.view',true),
  ('manager','customers.edit',true),
  ('manager','customers.delete',false),
  ('manager','memberships.view',true),
  ('manager','memberships.manage',true),
  ('manager','reports.view',true),
  ('manager','reports.export',true),
  ('manager','shifts.view',true),
  ('manager','shifts.edit',true),
  ('cashier','pos.use',true),
  ('cashier','pos.refund',false),
  ('cashier','giftcards.sell',true),
  ('cashier','services.edit',false),
  ('cashier','categories.edit',false),
  ('cashier','customers.view',true),
  ('cashier','customers.edit',false),
  ('cashier','customers.delete',false),
  ('cashier','memberships.view',false),
  ('cashier','memberships.manage',false),
  ('cashier','reports.view',false),
  ('cashier','reports.export',false),
  ('cashier','shifts.view',true),
  ('cashier','shifts.edit',false)
ON CONFLICT (role, permission_key) DO NOTHING;
