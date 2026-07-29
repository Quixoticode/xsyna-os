-- Maintenance scheduled windows (extends maintenance_mode concept)
CREATE TABLE IF NOT EXISTS public.maintenance_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Geplante Wartung',
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  progress int NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.maintenance_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_schedule_public_read"
  ON public.maintenance_schedule FOR SELECT
  USING (true);

CREATE POLICY "maintenance_schedule_admin_write"
  ON public.maintenance_schedule FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Public announcements / news (landing page content)
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  image_url text,
  link text,
  pinned boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT true,
  published_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_public_read"
  ON public.announcements FOR SELECT
  USING (published = true);

CREATE POLICY "announcements_admin_write"
  ON public.announcements FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Job postings
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  department text,
  location text,
  description text,
  requirements text[],
  active boolean NOT NULL DEFAULT true,
  published_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_public_read"
  ON public.jobs FOR SELECT
  USING (active = true);

CREATE POLICY "jobs_admin_write"
  ON public.jobs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Audit log for admin/moderator actions
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text,
  record_id text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_staff_read"
  ON public.audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','moderator')));

CREATE POLICY "audit_log_insert"
  ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User preferences (theme, etc)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  notifications_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_preferences_self"
  ON public.user_preferences FOR ALL
  USING (auth.uid() = id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_schedule_dates ON public.maintenance_schedule(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON public.announcements(published, published_at);
CREATE INDEX IF NOT EXISTS idx_jobs_active ON public.jobs(active, published_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id, created_at);

-- Insert default sample data if tables are empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.announcements LIMIT 1) THEN
    INSERT INTO public.announcements (title, body, pinned, published)
    VALUES ('Willkommen bei xSyna', 'Die Zukunft der neuronalen Intelligenz beginnt hier.', true, true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs LIMIT 1) THEN
    INSERT INTO public.jobs (title, department, location, description, requirements, active)
    VALUES ('Neuromorphic Engineer', 'Hardware', 'Remote / Berlin', 'Du entwickelst Spiking-Neuron-Chips.', ARRAY['Elektrotechnik', 'Neuromorphic Computing'], true);
  END IF;
END $$;
