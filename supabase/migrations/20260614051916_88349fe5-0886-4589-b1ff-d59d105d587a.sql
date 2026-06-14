
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS preferred_service_category_id uuid REFERENCES public.service_categories(id),
  ADD COLUMN IF NOT EXISTS preferred_service_name text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_category_id uuid REFERENCES public.service_categories(id);

-- Backfill: for each appointment with no customer_id, match or create a customer
DO $$
DECLARE
  r record;
  v_cid uuid;
  v_digits text;
BEGIN
  FOR r IN
    SELECT id, customer_name, customer_phone, customer_email, service_name, service_category_id, notes, created_at
      FROM public.appointments
     WHERE customer_id IS NULL
       AND customer_name IS NOT NULL
       AND customer_name <> ''
  LOOP
    v_cid := NULL;
    v_digits := regexp_replace(COALESCE(r.customer_phone, ''), '\D', '', 'g');

    IF length(v_digits) >= 7 THEN
      SELECT id INTO v_cid FROM public.customers
        WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') LIKE '%' || right(v_digits, 7)
        LIMIT 1;
    END IF;

    IF v_cid IS NULL AND r.customer_email IS NOT NULL AND r.customer_email <> '' THEN
      SELECT id INTO v_cid FROM public.customers
        WHERE lower(email) = lower(r.customer_email) LIMIT 1;
    END IF;

    IF v_cid IS NULL THEN
      INSERT INTO public.customers (full_name, phone, email, notes, preferred_service_name, preferred_service_category_id, marketing_opt_in)
      VALUES (r.customer_name, r.customer_phone, r.customer_email, r.notes, r.service_name, r.service_category_id, true)
      RETURNING id INTO v_cid;
    ELSE
      UPDATE public.customers SET
        email = COALESCE(email, r.customer_email),
        preferred_service_name = COALESCE(preferred_service_name, r.service_name),
        preferred_service_category_id = COALESCE(preferred_service_category_id, r.service_category_id),
        updated_at = now()
      WHERE id = v_cid;
    END IF;

    UPDATE public.appointments SET customer_id = v_cid WHERE id = r.id;
  END LOOP;
END $$;
