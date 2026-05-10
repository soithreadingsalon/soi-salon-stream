
-- 1. Grant EXECUTE on role helpers (root cause of all 403s)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) TO authenticated, anon;

-- 2. Loyalty accounts table
CREATE TABLE public.loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE,
  points_balance integer NOT NULL DEFAULT 0,
  lifetime_points integer NOT NULL DEFAULT 0,
  eyebrow_threading_count integer NOT NULL DEFAULT 0,
  free_eyebrow_credits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_read_all" ON public.loyalty_accounts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "loyalty_admin_write" ON public.loyalty_accounts
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','manager']::app_role[]));

-- 3. Loyalty transactions (audit trail)
CREATE TABLE public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  order_id uuid,
  points_delta integer NOT NULL DEFAULT 0,
  free_credits_delta integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loyalty_tx_read_all" ON public.loyalty_transactions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "loyalty_tx_insert" ON public.loyalty_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','admin','manager','cashier']::app_role[]));

-- 4. Trigger function: award loyalty when an order completes
CREATE OR REPLACE FUNCTION public.award_loyalty_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points int;
  v_eyebrow_count int := 0;
  v_threading_cat uuid;
  v_new_count int;
  v_credits_awarded int := 0;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;

  -- ensure account exists
  INSERT INTO public.loyalty_accounts (customer_id)
  VALUES (NEW.customer_id) ON CONFLICT (customer_id) DO NOTHING;

  v_points := floor(NEW.total)::int;

  SELECT id INTO v_threading_cat FROM public.service_categories WHERE slug = 'threading' LIMIT 1;

  SELECT COALESCE(SUM(oi.quantity),0) INTO v_eyebrow_count
  FROM public.order_items oi
  JOIN public.services s ON s.id = oi.service_id
  WHERE oi.order_id = NEW.id
    AND s.category_id = v_threading_cat
    AND lower(oi.service_name) = 'eyebrow';

  -- update account
  UPDATE public.loyalty_accounts
  SET points_balance = points_balance + v_points,
      lifetime_points = lifetime_points + v_points,
      eyebrow_threading_count = eyebrow_threading_count + v_eyebrow_count,
      updated_at = now()
  WHERE customer_id = NEW.customer_id
  RETURNING eyebrow_threading_count INTO v_new_count;

  -- free eyebrow credits: one for every 10
  IF v_eyebrow_count > 0 THEN
    v_credits_awarded := (v_new_count / 10) - ((v_new_count - v_eyebrow_count) / 10);
    IF v_credits_awarded > 0 THEN
      UPDATE public.loyalty_accounts
      SET free_eyebrow_credits = free_eyebrow_credits + v_credits_awarded
      WHERE customer_id = NEW.customer_id;
    END IF;
  END IF;

  INSERT INTO public.loyalty_transactions (customer_id, order_id, points_delta, free_credits_delta, reason)
  VALUES (NEW.customer_id, NEW.id, v_points, v_credits_awarded, 'order_completed');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_award_loyalty
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.award_loyalty_on_order();

-- 5. updated_at trigger helper for loyalty_accounts
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_loyalty_touch BEFORE UPDATE ON public.loyalty_accounts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
