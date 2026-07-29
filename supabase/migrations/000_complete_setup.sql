-- =============================================================================
-- xSyna Complete Supabase Schema
-- Run this once in the Supabase SQL Editor to set up the entire database.
-- =============================================================================

-- =============================================================================
-- 1. CORE USER EXTENSIONS
-- =============================================================================

-- Profiles: extends auth.users with role, permissions and profile data.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin','moderator','beta','user')),
  permissions text[] DEFAULT '{}',
  is_superuser boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_self_select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "profiles_self_update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Only admins can change roles / permissions / superuser status.
CREATE POLICY "profiles_admin_update_role"
  ON public.profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "profiles_admin_insert"
  ON public.profiles FOR INSERT
  WITH CHECK (true);

-- Trigger to create or sync a profile on auth signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  is_first_user boolean;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;

  INSERT INTO public.profiles (id, email, role, is_superuser, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    CASE WHEN is_first_user THEN 'admin' ELSE 'user' END,
    is_first_user,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      last_seen_at = now();

  IF is_first_user THEN
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, payload)
    VALUES (new.id, 'SUPERUSER_CREATED', 'profiles', new.id::text, jsonb_build_object('email', new.email));
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update last_seen_at on sign-in (via auth hook replacement or app code).
-- App code should call: update profiles set last_seen_at = now() where id = auth.uid();

-- =============================================================================
-- 2. SYSTEM CONFIGURATION
-- =============================================================================

-- Site config for tracking encryption key and general settings.
CREATE TABLE IF NOT EXISTS public.site_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tracking_key text,
  tracking_steps text[] DEFAULT '{}',
  brand_name text DEFAULT 'xSyna',
  default_locale text DEFAULT 'de',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_config_public_read"
  ON public.site_config FOR SELECT
  USING (true);

CREATE POLICY "site_config_admin_write"
  ON public.site_config FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Maintenance mode single-row config.
CREATE TABLE IF NOT EXISTS public.maintenance_mode (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  title text DEFAULT 'System wird aktualisiert...',
  status_text text DEFAULT 'Wir arbeiten an xSyna. Bitte hab einen Moment Geduld.',
  progress int DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.maintenance_mode ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_public_read"
  ON public.maintenance_mode FOR SELECT
  USING (true);

CREATE POLICY "maintenance_admin_write"
  ON public.maintenance_mode FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Feature flags: enable/disable parts of the UI or functionality.
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  min_role text NOT NULL DEFAULT 'user' CHECK (min_role IN ('admin','moderator','beta','user')),
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_public_read"
  ON public.feature_flags FOR SELECT
  USING (true);

CREATE POLICY "feature_flags_admin_write"
  ON public.feature_flags FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- System health metrics.
CREATE TABLE IF NOT EXISTS public.system_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text NOT NULL,
  status text NOT NULL DEFAULT 'operational' CHECK (status IN ('operational','degraded','down','maintenance')),
  value text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_health_public_read"
  ON public.system_health FOR SELECT
  USING (true);

CREATE POLICY "system_health_admin_write"
  ON public.system_health FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- =============================================================================
-- 3. CONTENT TABLES
-- =============================================================================

-- Public announcements / news (landing page content).
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

-- Job postings.
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

-- Docs.
CREATE TABLE IF NOT EXISTS public.docs (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  content text NOT NULL DEFAULT '# xSyna Docs\n\nHier kannst du interne Dokumentation editieren.',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "docs_public_read"
  ON public.docs FOR SELECT
  USING (true);

CREATE POLICY "docs_write"
  ON public.docs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','moderator')));

-- =============================================================================
-- 4. USER FEATURES
-- =============================================================================

-- Beta requests.
CREATE TABLE IF NOT EXISTS public.beta_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  product text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.beta_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beta_requests_self"
  ON public.beta_requests FOR ALL
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','moderator')));

-- Support tickets.
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'Offen',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tickets_self"
  ON public.support_tickets FOR ALL
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','moderator')));

-- CRM contacts.
CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'Lead',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_contacts_all_read"
  ON public.crm_contacts FOR SELECT
  USING (true);

CREATE POLICY "crm_contacts_write"
  ON public.crm_contacts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','moderator')));

-- Time tracking entries.
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date text NOT NULL,
  description text,
  duration_ms bigint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_entries_self"
  ON public.time_entries FOR ALL
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Chat messages.
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text text NOT NULL,
  type text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_self"
  ON public.chat_messages FOR ALL
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- User preferences.
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

-- Notifications.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning','system')),
  read boolean NOT NULL DEFAULT false,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_self"
  ON public.notifications FOR ALL
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- =============================================================================
-- 5. ORDERS & TRACKING
-- =============================================================================

-- Orders / commissions / jobs / tracking items.
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

CREATE POLICY "orders_public_by_id"
  ON public.orders FOR SELECT
  USING (is_public = true);

CREATE POLICY "orders_staff_manage"
  ON public.orders FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','moderator')));

-- Order status history.
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

-- =============================================================================
-- 6. MAINTENANCE & AUDIT
-- =============================================================================

-- Maintenance scheduled windows.
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

-- Audit log for admin/moderator actions.
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

-- =============================================================================
-- 7. EXTERNAL WEBAPPS / OAUTH
-- =============================================================================

-- Registered external applications (WebApps, CLI tools, integrations).
CREATE TABLE IF NOT EXISTS public.web_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  icon_url text,
  redirect_uris text[] DEFAULT '{}',
  scopes text[] DEFAULT '{read:profile}'::text[],
  public boolean NOT NULL DEFAULT true,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.web_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "web_apps_public_read"
  ON public.web_apps FOR SELECT
  USING (public = true AND approved = true OR owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "web_apps_owner_write"
  ON public.web_apps FOR ALL
  USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- User authorization grants for external apps.
CREATE TABLE IF NOT EXISTS public.web_app_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  app_id uuid REFERENCES public.web_apps(id) ON DELETE CASCADE NOT NULL,
  scopes text[] DEFAULT '{}',
  access_token_hash text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, app_id)
);

ALTER TABLE public.web_app_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "web_app_grants_self"
  ON public.web_app_grants FOR ALL
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Personal API keys for users (for CLI / custom integrations).
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  key_hash text UNIQUE NOT NULL,
  scopes text[] DEFAULT '{read:profile}'::text[],
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_api_keys_self"
  ON public.user_api_keys FOR ALL
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- =============================================================================
-- 8. INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_beta_requests_user_id ON public.beta_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON public.time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON public.announcements(published, published_at);
CREATE INDEX IF NOT EXISTS idx_jobs_active ON public.jobs(active, published_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedule_dates ON public.maintenance_schedule(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read, created_at);
CREATE INDEX IF NOT EXISTS idx_web_apps_slug ON public.web_apps(slug);
CREATE INDEX IF NOT EXISTS idx_web_apps_owner ON public.web_apps(owner_id);
CREATE INDEX IF NOT EXISTS idx_web_app_grants_user ON public.web_app_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_hash ON public.user_api_keys(key_hash);

-- =============================================================================
-- 9. DEFAULT DATA
-- =============================================================================

INSERT INTO public.site_config (id, tracking_key, tracking_steps)
VALUES (1, 'xsyna-default-tracking-key-32', ARRAY['Eingegangen','In Bearbeitung','Qualitätskontrolle','Abgeschlossen'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.maintenance_mode (id, enabled, title, status_text, progress)
VALUES (1, false, 'System wird aktualisiert...', 'Wir arbeiten an xSyna. Bitte hab einen Moment Geduld.', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.feature_flags (key, label, description, enabled, min_role)
VALUES
  ('webapps_directory', 'WebApp-Verzeichnis', 'Externe App-Directory im Account-Panel anzeigen', true, 'user'),
  ('api_keys', 'API-Keys', 'Persönliche API-Keys im Account verwalten', true, 'user'),
  ('notifications', 'Benachrichtigungen', 'Benachrichtigungs-Inbox aktivieren', true, 'user'),
  ('mini_synai', 'Mini SynAI', 'Mini SynAI Experiment aktivieren', true, 'user'),
  ('xyna_game', 'xSyna Game', 'xSyna Spiel aktivieren', true, 'user')
ON CONFLICT (key) DO NOTHING;

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
