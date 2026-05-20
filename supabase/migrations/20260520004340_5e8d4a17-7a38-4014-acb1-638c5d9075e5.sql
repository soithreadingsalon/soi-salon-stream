
-- ============ BUSINESS SETTINGS ============
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS cash_drawer_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cash_drawer_connection_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS cash_drawer_printer_ip text,
  ADD COLUMN IF NOT EXISTS cash_drawer_printer_port integer NOT NULL DEFAULT 9100;

UPDATE public.business_settings
SET business_name = 'SOI Threading Salon',
    address = '180 Hamburg Turnpk, Wayne, NJ 07470',
    phone = '551-301-3894',
    updated_at = now();

-- ============ SERVICES ============
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_variable_price boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_label text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'custom';

-- ============ ORDER ITEMS ============
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'service'
    CHECK (item_type IN ('service','gift_card','membership'));
ALTER TABLE public.order_items ALTER COLUMN service_id DROP NOT NULL;

-- ============ PAYMENTS ============
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS cash_drawer_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (cash_drawer_status IN ('not_applicable','opened','failed','disabled'));

-- ============ GIFT CARDS ============
CREATE TABLE IF NOT EXISTS public.gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  amount numeric NOT NULL CHECK (amount >= 0),
  balance numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  recipient_name text,
  buyer_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','redeemed','void')),
  order_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY gc_read_all ON public.gift_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY gc_cashier_insert ON public.gift_cards FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role,'cashier'::app_role]));
CREATE POLICY gc_admin_update ON public.gift_cards FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]));
CREATE POLICY gc_admin_delete ON public.gift_cards FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]));
CREATE TRIGGER trg_gift_cards_updated BEFORE UPDATE ON public.gift_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ MEMBERSHIPS ============
CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  customer_name text NOT NULL,
  membership_type text NOT NULL,
  price numeric NOT NULL CHECK (price >= 0),
  start_date date NOT NULL DEFAULT current_date,
  expiration_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled')),
  order_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY mem_read_all ON public.memberships FOR SELECT TO authenticated USING (true);
CREATE POLICY mem_cashier_insert ON public.memberships FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role,'cashier'::app_role]));
CREATE POLICY mem_admin_update ON public.memberships FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]));
CREATE POLICY mem_admin_delete ON public.memberships FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]));
CREATE TRIGGER trg_memberships_updated BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ WORKER SHIFTS ============
CREATE TABLE IF NOT EXISTS public.worker_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  worker_name text,
  shift_date date NOT NULL DEFAULT current_date,
  clock_in_at timestamptz NOT NULL DEFAULT now(),
  clock_out_at timestamptz,
  total_hours numeric,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','missing_clock_out','adjusted')),
  is_adjusted boolean NOT NULL DEFAULT false,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_worker_shifts_worker_date ON public.worker_shifts(worker_id, shift_date);
ALTER TABLE public.worker_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY shifts_self_read ON public.worker_shifts FOR SELECT TO authenticated
  USING (worker_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]));
CREATE POLICY shifts_self_insert ON public.worker_shifts FOR INSERT TO authenticated
  WITH CHECK (worker_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]));
CREATE POLICY shifts_self_update ON public.worker_shifts FOR UPDATE TO authenticated
  USING (worker_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]));
CREATE POLICY shifts_admin_delete ON public.worker_shifts FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]));
CREATE TRIGGER trg_worker_shifts_updated BEFORE UPDATE ON public.worker_shifts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ RESET FUNCTION (admin-only, for runtime use) ============
CREATE OR REPLACE FUNCTION public.reset_services_to_official_menu()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat_threading uuid; cat_waxing uuid; cat_facials uuid;
  cat_haircare uuid; cat_henna uuid; cat_men uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.service_categories (name, slug, icon, sort_order, active) VALUES
    ('Threading','threading','flower',1,true),
    ('Waxing','waxing','flame',2,true),
    ('Facials','facials','sparkles',3,true),
    ('Hair Care','hair-care','scissors',4,true),
    ('Henna','henna','palette',5,true),
    ('Men','men','user',6,true)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, active = true;

  SELECT id INTO cat_threading FROM public.service_categories WHERE slug='threading';
  SELECT id INTO cat_waxing    FROM public.service_categories WHERE slug='waxing';
  SELECT id INTO cat_facials   FROM public.service_categories WHERE slug='facials';
  SELECT id INTO cat_haircare  FROM public.service_categories WHERE slug='hair-care';
  SELECT id INTO cat_henna     FROM public.service_categories WHERE slug='henna';
  SELECT id INTO cat_men       FROM public.service_categories WHERE slug='men';

  DELETE FROM public.services;

  INSERT INTO public.services (category_id,name,price,starts_at,is_variable_price,price_label,taxable,active,sort_order,source) VALUES
    (cat_threading,'Eyebrow',10,false,false,'$10',false,true,1,'official_menu'),
    (cat_threading,'Upper Lip',6,false,false,'$6',false,true,2,'official_menu'),
    (cat_threading,'Chin',8,false,false,'$8',false,true,3,'official_menu'),
    (cat_threading,'Cheeks',8,false,false,'$8',false,true,4,'official_menu'),
    (cat_threading,'Forehead',8,false,false,'$8',false,true,5,'official_menu'),
    (cat_threading,'Sideburns',12,false,false,'$12',false,true,6,'official_menu'),
    (cat_threading,'Full Face',35,false,false,'$35',false,true,7,'official_menu'),
    (cat_threading,'Full Face with Neck',40,false,false,'$40',false,true,8,'official_menu'),
    (cat_waxing,'Full Face',40,false,false,'$40',false,true,1,'official_menu'),
    (cat_waxing,'Full Hand',30,false,false,'$30',false,true,2,'official_menu'),
    (cat_waxing,'Full Leg',45,false,false,'$45',false,true,3,'official_menu'),
    (cat_waxing,'Under Arms',15,false,false,'$15',false,true,4,'official_menu'),
    (cat_waxing,'Upper Leg',35,false,false,'$35',false,true,5,'official_menu'),
    (cat_waxing,'Lower Leg',30,false,false,'$30',false,true,6,'official_menu'),
    (cat_waxing,'Bikini Line',20,false,false,'$20',false,true,7,'official_menu'),
    (cat_waxing,'Brazilian',45,false,false,'$45',false,true,8,'official_menu'),
    (cat_waxing,'Full Back',40,false,false,'$40',false,true,9,'official_menu'),
    (cat_waxing,'Full Stomach',40,false,false,'$40',false,true,10,'official_menu'),
    (cat_waxing,'Body Wax',180,true,true,'$180 & up',false,true,11,'official_menu'),
    (cat_facials,'Mini Facial',45,false,false,'$45',false,true,1,'official_menu'),
    (cat_facials,'Acne Facial',65,false,false,'$65',false,true,2,'official_menu'),
    (cat_facials,'Gold Facial',65,false,false,'$65',false,true,3,'official_menu'),
    (cat_facials,'Oxygen Facial',90,false,false,'$90',false,true,4,'official_menu'),
    (cat_facials,'Casmara Gold',75,false,false,'$75',false,true,5,'official_menu'),
    (cat_facials,'Teenage Facial',55,false,false,'$55',false,true,6,'official_menu'),
    (cat_facials,'Shiner',20,false,false,'$20',false,true,7,'official_menu'),
    (cat_haircare,'Scalp Oil Massage',35,false,false,'$35',false,true,1,'official_menu'),
    (cat_haircare,'Henna Hair Dye',30,true,true,'$30 & up',false,true,2,'official_menu'),
    (cat_haircare,'Eyelash Lifting',75,false,false,'$75',false,true,3,'official_menu'),
    (cat_haircare,'Eyelash Extension',60,false,false,'$60',false,true,4,'official_menu'),
    (cat_henna,'Simple Tattoo',15,true,true,'$15 & up',false,true,1,'official_menu'),
    (cat_men,'Eyebrow',11,false,false,'$11',false,true,1,'official_menu'),
    (cat_men,'Nose Hair Removal',15,false,false,'$15',false,true,2,'official_menu'),
    (cat_men,'Blackhead Removal',15,false,false,'$15',false,true,3,'official_menu'),
    (cat_men,'Ear Wax',15,false,false,'$15',false,true,4,'official_menu'),
    (cat_men,'Back Wax',45,true,true,'$45 & up',false,true,5,'official_menu'),
    (cat_men,'Chest Wax',45,true,true,'$45 & up',false,true,6,'official_menu');
END $$;

REVOKE ALL ON FUNCTION public.reset_services_to_official_menu() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_services_to_official_menu() TO authenticated;

-- Run the seed inline (no auth.uid() at migration time → the guard skips)
SELECT public.reset_services_to_official_menu();
