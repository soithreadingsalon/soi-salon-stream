
-- =========================================================
-- Reports v2 + Appointments + Backups (additive)
-- =========================================================

-- 1. Extend payment_method enum (non-destructive)
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'zelle';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'external_card';

-- 2. Extend payments table
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_channel text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS card_funding text,
  ADD COLUMN IF NOT EXISTS zelle_reference text,
  ADD COLUMN IF NOT EXISTS zelle_sender text,
  ADD COLUMN IF NOT EXISTS zelle_note text,
  ADD COLUMN IF NOT EXISTS tip_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_amount numeric(12,2) NOT NULL DEFAULT 0;

-- Backfill provider + channel from existing method
UPDATE public.payments SET
  provider = COALESCE(provider, CASE method::text
    WHEN 'cash' THEN 'manual'
    WHEN 'card' THEN 'manual'
    WHEN 'gift_card' THEN 'gift_card'
    ELSE 'other' END),
  payment_channel = COALESCE(payment_channel, 'in_person')
WHERE provider IS NULL OR payment_channel IS NULL;

-- 3. Appointment status enum
DO $$ BEGIN
  CREATE TYPE public.appointment_status AS ENUM
    ('new','confirmed','checked_in','waiting','in_service','completed','cancelled','no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Appointments table
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text,
  customer_email text,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  service_name text,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30,
  assigned_staff_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  booking_source text NOT NULL DEFAULT 'manual',
  external_booking_id text,
  external_source text,
  status public.appointment_status NOT NULL DEFAULT 'new',
  notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  checked_in_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  no_show_at timestamptz,
  sync_status text,
  last_synced_at timestamptz,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_ext_uniq
  ON public.appointments(external_source, external_booking_id)
  WHERE external_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointments_date_idx ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS appointments_staff_idx ON public.appointments(assigned_staff_id);
CREATE INDEX IF NOT EXISTS appointments_status_idx ON public.appointments(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appt_admin_all" ON public.appointments
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]));

CREATE POLICY "appt_cashier_read" ON public.appointments
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['cashier'::app_role]));

-- Staff: see own assignments + unassigned today when on shift
CREATE POLICY "appt_staff_read" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'staff'::app_role) AND (
      assigned_staff_id = auth.uid()
      OR (
        assigned_staff_id IS NULL
        AND appointment_date = CURRENT_DATE
        AND EXISTS (
          SELECT 1 FROM public.worker_shifts ws
          WHERE ws.worker_id = auth.uid()
            AND ws.shift_date = CURRENT_DATE
            AND ws.status = 'open'
        )
      )
    )
  );

-- Staff: update status on their own assignments
CREATE POLICY "appt_staff_update_own" ON public.appointments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'staff'::app_role) AND assigned_staff_id = auth.uid())
  WITH CHECK (assigned_staff_id = auth.uid());

-- updated_at trigger
CREATE TRIGGER trg_appointments_touch
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Appointments soft-delete shadow
CREATE TABLE IF NOT EXISTS public.appointments_deleted (
  LIKE public.appointments INCLUDING ALL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, DELETE ON public.appointments_deleted TO authenticated;
GRANT ALL ON public.appointments_deleted TO service_role;
ALTER TABLE public.appointments_deleted ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appt_del_admin" ON public.appointments_deleted
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]));

CREATE OR REPLACE FUNCTION public.soft_delete_appointment(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.appointments_deleted
  SELECT a.*, now(), auth.uid() FROM public.appointments a WHERE a.id = _id;
  DELETE FROM public.appointments WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.restore_appointment(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.appointments
  SELECT (a).* FROM (SELECT a FROM public.appointments_deleted a WHERE a.id = _id) s(a);
  DELETE FROM public.appointments_deleted WHERE id = _id;
END $$;

-- 6. Daily closeout table
CREATE TABLE IF NOT EXISTS public.daily_closeouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closeout_date date NOT NULL UNIQUE,
  expected_cash numeric(12,2) NOT NULL DEFAULT 0,
  actual_cash numeric(12,2) NOT NULL DEFAULT 0,
  cash_difference numeric(12,2) GENERATED ALWAYS AS (actual_cash - expected_cash) STORED,
  card_total numeric(12,2) NOT NULL DEFAULT 0,
  zelle_total numeric(12,2) NOT NULL DEFAULT 0,
  external_card_total numeric(12,2) NOT NULL DEFAULT 0,
  gift_card_total numeric(12,2) NOT NULL DEFAULT 0,
  refund_total numeric(12,2) NOT NULL DEFAULT 0,
  net_sales numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.daily_closeouts TO authenticated;
GRANT ALL ON public.daily_closeouts TO service_role;
ALTER TABLE public.daily_closeouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "closeout_admin_mgr_all" ON public.daily_closeouts
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role,'manager'::app_role]));
CREATE TRIGGER trg_closeouts_touch BEFORE UPDATE ON public.daily_closeouts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. Backup tables (nightly snapshots)
CREATE TABLE IF NOT EXISTS public.orders_backup (
  LIKE public.orders INCLUDING DEFAULTS,
  snapshot_date date NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, snapshot_date)
);
CREATE TABLE IF NOT EXISTS public.payments_backup (
  LIKE public.payments INCLUDING DEFAULTS,
  snapshot_date date NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, snapshot_date)
);
CREATE TABLE IF NOT EXISTS public.appointments_backup (
  LIKE public.appointments INCLUDING DEFAULTS,
  snapshot_date date NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, snapshot_date)
);
GRANT SELECT ON public.orders_backup, public.payments_backup, public.appointments_backup TO authenticated;
GRANT ALL ON public.orders_backup, public.payments_backup, public.appointments_backup TO service_role;
ALTER TABLE public.orders_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments_backup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backup_admin_read_o" ON public.orders_backup FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]));
CREATE POLICY "backup_admin_read_p" ON public.payments_backup FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]));
CREATE POLICY "backup_admin_read_a" ON public.appointments_backup FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin'::app_role,'admin'::app_role]));

CREATE OR REPLACE FUNCTION public.run_daily_backups()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d date := (CURRENT_DATE - INTERVAL '1 day')::date;
BEGIN
  INSERT INTO public.orders_backup
  SELECT o.*, d, now() FROM public.orders o
  WHERE o.created_at::date = d
  ON CONFLICT (id, snapshot_date) DO NOTHING;

  INSERT INTO public.payments_backup
  SELECT p.*, d, now() FROM public.payments p
  WHERE p.created_at::date = d
  ON CONFLICT (id, snapshot_date) DO NOTHING;

  INSERT INTO public.appointments_backup
  SELECT a.*, d, now() FROM public.appointments a
  WHERE a.created_at::date = d
  ON CONFLICT (id, snapshot_date) DO NOTHING;
END $$;

-- 8. Permission key seeds
INSERT INTO public.role_permissions (role, permission_key, allowed) VALUES
  ('cashier','reports.today_only', true),
  ('cashier','reports.full', false),
  ('manager','reports.full', true),
  ('manager','appointments.view_all', true),
  ('manager','appointments.assign', true),
  ('manager','appointments.checkin', true),
  ('manager','appointments.cancel', true),
  ('cashier','appointments.view_all', true),
  ('cashier','appointments.checkin', true),
  ('staff','appointments.checkin', true)
ON CONFLICT (role, permission_key) DO NOTHING;
