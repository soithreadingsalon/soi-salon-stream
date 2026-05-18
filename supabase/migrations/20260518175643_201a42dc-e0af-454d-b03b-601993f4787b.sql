
-- Backup tables mirror live tables + audit columns
CREATE TABLE IF NOT EXISTS public.customers_deleted (
  id uuid PRIMARY KEY,
  full_name text NOT NULL,
  phone text,
  email text,
  birthday date,
  notes text,
  allergies text,
  preferred_staff_id uuid,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  total_spend numeric NOT NULL DEFAULT 0,
  visit_count integer NOT NULL DEFAULT 0,
  no_show_count integer NOT NULL DEFAULT 0,
  last_visit_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid
);

CREATE TABLE IF NOT EXISTS public.services_deleted (
  id uuid PRIMARY KEY,
  category_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  starts_at boolean NOT NULL DEFAULT false,
  duration_minutes integer DEFAULT 15,
  taxable boolean NOT NULL DEFAULT true,
  commission_eligible boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid
);

ALTER TABLE public.customers_deleted ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_deleted  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deleted_admin_all_customers" ON public.customers_deleted
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]));

CREATE POLICY "deleted_admin_all_services" ON public.services_deleted
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]));

-- Customers
CREATE OR REPLACE FUNCTION public.soft_delete_customer(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.customers_deleted
    (id, full_name, phone, email, birthday, notes, allergies, preferred_staff_id,
     marketing_opt_in, total_spend, visit_count, no_show_count, last_visit_at,
     created_by, created_at, updated_at, deleted_by)
  SELECT id, full_name, phone, email, birthday, notes, allergies, preferred_staff_id,
         marketing_opt_in, total_spend, visit_count, no_show_count, last_visit_at,
         created_by, created_at, updated_at, auth.uid()
  FROM public.customers WHERE id = _id
  ON CONFLICT (id) DO UPDATE SET deleted_at = now(), deleted_by = auth.uid();
  DELETE FROM public.customers WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.restore_customer(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.customers
    (id, full_name, phone, email, birthday, notes, allergies, preferred_staff_id,
     marketing_opt_in, total_spend, visit_count, no_show_count, last_visit_at,
     created_by, created_at, updated_at)
  SELECT id, full_name, phone, email, birthday, notes, allergies, preferred_staff_id,
         marketing_opt_in, total_spend, visit_count, no_show_count, last_visit_at,
         created_by, created_at, now()
  FROM public.customers_deleted WHERE id = _id;
  DELETE FROM public.customers_deleted WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.hard_delete_customer(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.customers         WHERE id = _id;
  DELETE FROM public.customers_deleted WHERE id = _id;
END $$;

-- Services
CREATE OR REPLACE FUNCTION public.soft_delete_service(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.services_deleted
    (id, category_id, name, description, price, starts_at, duration_minutes,
     taxable, commission_eligible, active, sort_order, image_url,
     created_at, updated_at, deleted_by)
  SELECT id, category_id, name, description, price, starts_at, duration_minutes,
         taxable, commission_eligible, active, sort_order, image_url,
         created_at, updated_at, auth.uid()
  FROM public.services WHERE id = _id
  ON CONFLICT (id) DO UPDATE SET deleted_at = now(), deleted_by = auth.uid();
  DELETE FROM public.services WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.restore_service(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.services
    (id, category_id, name, description, price, starts_at, duration_minutes,
     taxable, commission_eligible, active, sort_order, image_url,
     created_at, updated_at)
  SELECT id, category_id, name, description, price, starts_at, duration_minutes,
         taxable, commission_eligible, active, sort_order, image_url,
         created_at, now()
  FROM public.services_deleted WHERE id = _id;
  DELETE FROM public.services_deleted WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.hard_delete_service(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.services         WHERE id = _id;
  DELETE FROM public.services_deleted WHERE id = _id;
END $$;
