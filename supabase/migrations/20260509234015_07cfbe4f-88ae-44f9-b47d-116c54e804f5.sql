
-- Restrict SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_any_role(UUID, public.app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- RLS policies use these via the postgres role evaluator, no grants needed.

-- ============ SEED BUSINESS ============
INSERT INTO public.business_settings (business_name, address, phone, email, website, instagram, hours, tax_rate, tip_presets, receipt_footer, refund_policy)
VALUES (
  'SOI Threading Salon',
  '190 Hamburg Turnpike, Wayne, NJ 07470',
  '551-301-3894',
  'soithreadingsalon@gmail.com',
  'www.soithreadingandsalon.com',
  '@soithreadingsalon',
  '{"mon":"10am-7pm","tue":"10am-7pm","wed":"10am-7pm","thu":"10am-7pm","fri":"10am-7pm","sat":"10am-6pm","sun":"11am-4pm"}'::jsonb,
  0.06625,
  ARRAY[15,18,20],
  'Thank you for visiting SOI Threading Salon! Follow us on Instagram @soithreadingsalon',
  'All services are final. Product returns accepted within 7 days with receipt.'
);

-- ============ SEED CATEGORIES ============
INSERT INTO public.service_categories (name, slug, sort_order, icon) VALUES
('Threading','threading',1,'sparkles'),
('Waxing','waxing',2,'flame'),
('Facials','facials',3,'flower'),
('Hair Care','hair-care',4,'scissors'),
('Henna','henna',5,'palette'),
('Men','men',6,'user'),
('Packages','packages',7,'gift'),
('Memberships','memberships',8,'crown'),
('Gift Cards','gift-cards',9,'credit-card');

-- ============ SEED SERVICES ============
DO $$
DECLARE
  c_thread UUID; c_wax UUID; c_fac UUID; c_hair UUID; c_henna UUID; c_men UUID;
BEGIN
  SELECT id INTO c_thread FROM public.service_categories WHERE slug='threading';
  SELECT id INTO c_wax FROM public.service_categories WHERE slug='waxing';
  SELECT id INTO c_fac FROM public.service_categories WHERE slug='facials';
  SELECT id INTO c_hair FROM public.service_categories WHERE slug='hair-care';
  SELECT id INTO c_henna FROM public.service_categories WHERE slug='henna';
  SELECT id INTO c_men FROM public.service_categories WHERE slug='men';

  INSERT INTO public.services (category_id,name,price,starts_at,duration_minutes,sort_order) VALUES
  -- Threading
  (c_thread,'Eyebrow',10,false,10,1),
  (c_thread,'Upper Lip',6,false,5,2),
  (c_thread,'Chin',8,false,5,3),
  (c_thread,'Cheeks',8,false,10,4),
  (c_thread,'Forehead',8,false,5,5),
  (c_thread,'Sideburns',12,false,10,6),
  (c_thread,'Full Face',35,false,30,7),
  (c_thread,'Full Face with Neck',40,false,35,8),
  -- Waxing
  (c_wax,'Full Face',40,false,30,1),
  (c_wax,'Full Hand',30,false,20,2),
  (c_wax,'Full Leg',45,false,40,3),
  (c_wax,'Under Arms',15,false,10,4),
  (c_wax,'Upper Leg',35,false,25,5),
  (c_wax,'Lower Leg',30,false,25,6),
  (c_wax,'Bikini Line',20,false,15,7),
  (c_wax,'Brazilian',45,false,30,8),
  (c_wax,'Full Back',40,false,30,9),
  (c_wax,'Full Stomach',40,false,30,10),
  (c_wax,'Body Wax',180,true,60,11),
  -- Facials
  (c_fac,'Mini Facial',45,false,30,1),
  (c_fac,'Acne Facial',65,false,60,2),
  (c_fac,'Gold Facial',65,false,60,3),
  (c_fac,'Oxygen Facial',90,false,60,4),
  (c_fac,'Casmara Gold',75,false,60,5),
  (c_fac,'Teenage Facial',55,false,45,6),
  (c_fac,'Shiner',20,false,15,7),
  -- Hair Care
  (c_hair,'Scalp Oil Massage',35,false,30,1),
  (c_hair,'Henna Hair Dye',30,true,60,2),
  (c_hair,'Eyelash Lifting',75,false,60,3),
  (c_hair,'Eyelash Extension',60,false,90,4),
  -- Men
  (c_men,'Eyebrow',11,false,10,1),
  (c_men,'Nose Hair Removal',15,false,10,2),
  (c_men,'Blackhead Removal',15,false,15,3),
  (c_men,'Ear Wax',15,false,10,4),
  (c_men,'Back Wax',45,true,30,5),
  (c_men,'Chest Wax',45,true,30,6),
  -- Henna
  (c_henna,'Simple Tattoo',15,true,15,1);
END $$;
