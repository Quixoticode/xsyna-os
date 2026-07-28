-- Order tracking and progress configuration

-- Site config for tracking encryption key and general settings
CREATE TABLE IF NOT EXISTS public.site_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tracking_key text,
  tracking_steps text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_config_public_read"
  ON public.site_config FOR SELECT
  USING (true);

CREATE POLICY "site_config_admin_write"
  ON public.site_config FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Orders / commissions / jobs / tracking items
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email text NOT NULL,
  title text NOT NULL DEFAULT 'Auftrag',
  description text,
  status text NOT NULL DEFAULT 'Eingegangen',
  progress int NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  steps jsonb DEFAULT '[]'::jsonb,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Anyone can read a public order by id (used by tracking page)
CREATE POLICY "orders_public_by_id"
  ON public.orders FOR SELECT
  USING (is_public = true);

-- Admins and moderators can manage all orders
CREATE POLICY "orders_staff_manage"
  ON public.orders FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','moderator')));

-- Order status history
CREATE TABLE IF NOT EXISTS public.order_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL,
  progress int NOT NULL DEFAULT 0,
  message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.order_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_updates_public"
  ON public.order_updates FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.is_public = true));

CREATE POLICY "order_updates_staff_manage"
  ON public.order_updates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','moderator')));

-- Insert default site config and maintenance
INSERT INTO public.site_config (id, tracking_key, tracking_steps)
VALUES (1, 'xsyna-default-tracking-key-32', '{Eingegangen,In Bearbeitung,Qualitätskontrolle,Abgeschlossen}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.maintenance_mode (id, enabled, title, status_text, progress)
VALUES (1, false, 'System wird aktualisiert...', 'Wir arbeiten an xSyna. Bitte hab einen Moment Geduld.', 0)
ON CONFLICT (id) DO NOTHING;
