-- Extend order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_customer';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_confirmation';

-- register_sessions table
CREATE TABLE IF NOT EXISTS public.register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  register_name text NOT NULL DEFAULT 'Register 1',
  active_order_id uuid,
  paired_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.register_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "register_read_all" ON public.register_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "register_write_staff" ON public.register_sessions
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role,'cashier'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role,'cashier'::app_role]));

CREATE TRIGGER register_sessions_touch
  BEFORE UPDATE ON public.register_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- New columns on orders for live customer-side state
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS register_session_id uuid REFERENCES public.register_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_tip_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_payment_method text,
  ADD COLUMN IF NOT EXISTS customer_paid_confirmed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_register_session ON public.orders(register_session_id);

-- Enable Realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.register_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.register_sessions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;