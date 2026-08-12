-- ============================================================
-- xSyna Complete Database Schema
-- No recursive RLS policies. All tables use auth.uid() directly.
-- Drop all existing public tables to start fresh.
-- ============================================================

-- Ensure gen_random_uuid() is available for default UUIDs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing tables in reverse dependency order
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.webhook_logs CASCADE;
DROP TABLE IF EXISTS public.webhooks CASCADE;
DROP TABLE IF EXISTS public.inference_logs CASCADE;
DROP TABLE IF EXISTS public.usage_stats CASCADE;
DROP TABLE IF EXISTS public.quotas CASCADE;
DROP TABLE IF EXISTS public.published_models CASCADE;
DROP TABLE IF EXISTS public.tuning_jobs CASCADE;
DROP TABLE IF EXISTS public.datasets CASCADE;
DROP TABLE IF EXISTS public.api_keys CASCADE;
DROP TABLE IF EXISTS public.web_app_grants CASCADE;
DROP TABLE IF EXISTS public.web_apps CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.billing_tiers CASCADE;
DROP TABLE IF EXISTS public.team_members CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.referrals CASCADE;
DROP TABLE IF EXISTS public.applications CASCADE;
DROP TABLE IF EXISTS public.feedback CASCADE;
DROP TABLE IF EXISTS public.waitlist CASCADE;
DROP TABLE IF EXISTS public.saved_prompts CASCADE;
DROP TABLE IF EXISTS public.game_scores CASCADE;
DROP TABLE IF EXISTS public.invite_codes CASCADE;
DROP TABLE IF EXISTS public.user_preferences CASCADE;
DROP TABLE IF EXISTS public.user_devices CASCADE;
DROP TABLE IF EXISTS public.newsletter_subscribers CASCADE;
DROP TABLE IF EXISTS public.feature_flags CASCADE;
DROP TABLE IF EXISTS public.role_permissions CASCADE;
DROP TABLE IF EXISTS public.system_health CASCADE;
DROP TABLE IF EXISTS public.jobs CASCADE;
DROP TABLE IF EXISTS public.announcements CASCADE;
DROP TABLE IF EXISTS public.maintenance_schedule CASCADE;
DROP TABLE IF EXISTS public.order_updates CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.ticket_messages CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;
DROP TABLE IF EXISTS public.crm_contacts CASCADE;
DROP TABLE IF EXISTS public.time_entries CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.beta_requests CASCADE;
DROP TABLE IF EXISTS public.site_config CASCADE;
DROP TABLE IF EXISTS public.maintenance_mode CASCADE;
DROP TABLE IF EXISTS public.docs CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;


-- ============================================================
-- CORE TABLES
-- ============================================================

-- Profiles: linked to auth.users via id (uuid)
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  role        TEXT NOT NULL DEFAULT 'user',       -- user, moderator, admin
  permissions TEXT[] DEFAULT '{}',
  display_name TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- SECURITY DEFINER helper functions. RLS policies must NOT query
-- public.profiles directly inside their own USING/WITH CHECK expression,
-- otherwise PostgreSQL raises "infinite recursion detected in policy for
-- relation profiles". These functions run as the owner (postgres), which
-- bypasses RLS, so they are safe to use inside policies.
CREATE OR REPLACE FUNCTION public.has_profile()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  );
$$;

-- RLS for profiles: a user can read/update their own row.
-- Admins can read ALL rows. We avoid recursion by checking the
-- current user's role from the profile being selected, but never
-- re-selecting profiles inside the policy.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can always read their own profile
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (id = auth.uid());

-- Admins can read all profiles (no recursion: we check the row's role directly)
CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT USING (
    public.is_admin()
  );

-- Users can update their own profile (but not role, unless admin)
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins can update any profile
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE USING (
    public.is_admin()
  );

-- Only admins can delete
CREATE POLICY profiles_delete_admin ON public.profiles
  FOR DELETE USING (
    public.is_admin()
  );

-- Allow a user to insert their own profile (the auth trigger inserts via
-- SECURITY DEFINER, which bypasses RLS anyway).
CREATE POLICY profiles_insert_service ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Prevent privilege escalation: a non-admin must not be able to change their
-- own (or anyone's) role via a direct UPDATE. RLS is row-level and cannot
-- restrict single columns, so this trigger enforces the role invariant.
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role ON public.profiles;
CREATE TRIGGER protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- Auto-create profile on sign-up.
-- The VERY FIRST user to sign up becomes the superuser/admin.
-- All subsequent users default to 'user'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count = 0 THEN
    INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, 'admin');
  ELSE
    INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, 'user');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- SITE CONFIG & MAINTENANCE
-- ============================================================

CREATE TABLE public.site_config (
  id      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config  JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_config_select ON public.site_config FOR SELECT USING (true);
CREATE POLICY site_config_admin ON public.site_config FOR ALL USING (
  public.is_admin()
);

CREATE TABLE public.maintenance_mode (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled     BOOLEAN NOT NULL DEFAULT false,
  title       TEXT DEFAULT 'Wartungsmodus',
  status_text TEXT DEFAULT 'System wird aktualisiert...',
  progress    INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.maintenance_mode ENABLE ROW LEVEL SECURITY;
CREATE POLICY maint_select ON public.maintenance_mode FOR SELECT USING (true);
CREATE POLICY maint_admin ON public.maintenance_mode FOR ALL USING (
  public.is_admin()
);

-- Insert default maintenance row
INSERT INTO public.maintenance_mode (id, enabled) VALUES (1, false) ON CONFLICT DO NOTHING;
INSERT INTO public.site_config (id, config) VALUES (1, '{}'::jsonb) ON CONFLICT DO NOTHING;


-- ============================================================
-- ANNOUNCEMENTS & JOBS
-- ============================================================

CREATE TABLE public.announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  pinned     BOOLEAN DEFAULT false,
  active     BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY announcements_select ON public.announcements FOR SELECT USING (active = true);
CREATE POLICY announcements_admin ON public.announcements FOR ALL USING (
  public.is_admin()
);

CREATE TABLE public.jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  department   TEXT,
  location     TEXT,
  description  TEXT,
  requirements TEXT[] DEFAULT '{}',
  active       BOOLEAN DEFAULT true,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY jobs_select ON public.jobs FOR SELECT USING (active = true);
CREATE POLICY jobs_admin ON public.jobs FOR ALL USING (
  public.is_admin()
);


-- ============================================================
-- ORDERS & TRACKING
-- ============================================================

CREATE TABLE public.orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  tracking_code   TEXT UNIQUE,
  progress        INTEGER DEFAULT 0,
  customer_email  TEXT,
  customer_name   TEXT,
  steps           JSONB DEFAULT '[]',
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_select_public ON public.orders FOR SELECT USING (true);
CREATE POLICY orders_admin ON public.orders FOR ALL USING (
  public.is_staff()
);

CREATE TABLE public.order_updates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  status     TEXT,
  progress   INTEGER,
  message    TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.order_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_updates_select ON public.order_updates FOR SELECT USING (true);
CREATE POLICY order_updates_admin ON public.order_updates FOR ALL USING (
  public.is_staff()
);


-- ============================================================
-- BETA & SUPPORT
-- ============================================================

CREATE TABLE public.beta_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  product    TEXT NOT NULL,
  status     TEXT DEFAULT 'pending',
  message    TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.beta_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY beta_select_own ON public.beta_requests FOR SELECT USING (user_id = auth.uid());
CREATE POLICY beta_insert_own ON public.beta_requests FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY beta_admin ON public.beta_requests FOR ALL USING (
  public.is_staff()
);

CREATE TABLE public.tickets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  subject    TEXT NOT NULL,
  status     TEXT DEFAULT 'open',
  priority   TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tickets_select_own ON public.tickets FOR SELECT USING (user_id = auth.uid());
CREATE POLICY tickets_insert_own ON public.tickets FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY tickets_admin ON public.tickets FOR ALL USING (
  public.is_staff()
);

CREATE TABLE public.ticket_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id),
  body       TEXT NOT NULL,
  is_staff   BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_msg_select ON public.ticket_messages FOR SELECT USING (
  ticket_id IN (SELECT id FROM public.tickets WHERE user_id = auth.uid())
  OR public.is_staff()
);
CREATE POLICY ticket_msg_insert ON public.ticket_messages FOR INSERT WITH CHECK (true);


-- ============================================================
-- CRM, TIME, CHAT, DOCS
-- ============================================================

CREATE TABLE public.crm_contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  company    TEXT,
  notes      TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_select ON public.crm_contacts FOR SELECT USING (
  public.has_profile()
);
CREATE POLICY crm_write ON public.crm_contacts FOR ALL USING (
  public.is_staff()
);

CREATE TABLE public.time_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  project    TEXT,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time   TIMESTAMPTZ,
  duration   INTERVAL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY time_select_own ON public.time_entries FOR SELECT USING (user_id = auth.uid());
CREATE POLICY time_insert_own ON public.time_entries FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY time_admin ON public.time_entries FOR ALL USING (
  public.is_admin()
);

CREATE TABLE public.chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  channel    TEXT DEFAULT 'general',
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_select ON public.chat_messages FOR SELECT USING (
  public.has_profile()
);
CREATE POLICY chat_insert ON public.chat_messages FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE TABLE public.docs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  content    TEXT DEFAULT '',
  slug       TEXT UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY docs_select ON public.docs FOR SELECT USING (true);
CREATE POLICY docs_write ON public.docs FOR ALL USING (
  public.is_staff()
);


-- ============================================================
-- NOTIFICATIONS, API KEYS, WEB APPS
-- ============================================================

CREATE TABLE public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read       BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notif_own ON public.notifications FOR ALL USING (user_id = auth.uid());
CREATE POLICY notif_admin_insert ON public.notifications FOR INSERT WITH CHECK (
  public.is_admin()
);

CREATE TABLE public.api_keys (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  name       TEXT NOT NULL,
  key_hash   TEXT NOT NULL,
  permissions TEXT[] DEFAULT '{}',
  revoked    BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY apikey_own ON public.api_keys FOR ALL USING (user_id = auth.uid());

CREATE TABLE public.web_apps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  url         TEXT,
  icon        TEXT,
  category    TEXT DEFAULT 'tool',
  active      BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.web_apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY webapps_select ON public.web_apps FOR SELECT USING (active = true);
CREATE POLICY webapps_admin ON public.web_apps FOR ALL USING (
  public.is_admin()
);

CREATE TABLE public.web_app_grants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_app_id UUID REFERENCES public.web_apps(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id),
  permissions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.web_app_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY grants_own ON public.web_app_grants FOR SELECT USING (user_id = auth.uid());
CREATE POLICY grants_admin ON public.web_app_grants FOR ALL USING (
  public.is_admin()
);


-- ============================================================
-- GAMES, INVITES, WAITLIST, FEEDBACK, APPLICATIONS
-- ============================================================

CREATE TABLE public.game_scores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  game       TEXT NOT NULL,
  score      INTEGER NOT NULL,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY games_select ON public.game_scores FOR SELECT USING (true);
CREATE POLICY games_insert ON public.game_scores FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE TABLE public.invite_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT UNIQUE NOT NULL,
  uses_left  INTEGER,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY invite_select ON public.invite_codes FOR SELECT USING (true);
CREATE POLICY invite_admin ON public.invite_codes FOR ALL USING (
  public.is_admin()
);

CREATE TABLE public.waitlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  product    TEXT,
  status     TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY waitlist_insert ON public.waitlist FOR INSERT WITH CHECK (true);
CREATE POLICY waitlist_admin ON public.waitlist FOR ALL USING (
  public.is_admin()
);

CREATE TABLE public.feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  subject    TEXT,
  body       TEXT NOT NULL,
  category   TEXT DEFAULT 'general',
  status     TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_insert ON public.feedback FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY feedback_own ON public.feedback FOR SELECT USING (user_id = auth.uid());
CREATE POLICY feedback_admin ON public.feedback FOR ALL USING (
  public.is_admin()
);

CREATE TABLE public.applications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  job_id     UUID REFERENCES public.jobs(id),
  name       TEXT,
  email      TEXT,
  message    TEXT,
  status     TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_insert ON public.applications FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY app_own ON public.applications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY app_admin ON public.applications FOR ALL USING (
  public.is_staff()
);


-- ============================================================
-- MISC: USER PREFS, DEVICES, NEWSLETTER, FEATURE FLAGS, PERMISSIONS
-- ============================================================

CREATE TABLE public.user_preferences (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme      TEXT DEFAULT 'dark',
  language   TEXT DEFAULT 'de',
  prefs      JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY prefs_own ON public.user_preferences FOR ALL USING (user_id = auth.uid());

CREATE TABLE public.user_devices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  device_info JSONB DEFAULT '{}',
  last_seen  TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY devices_own ON public.user_devices FOR ALL USING (user_id = auth.uid());

CREATE TABLE public.newsletter_subscribers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY newsletter_insert ON public.newsletter_subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY newsletter_admin ON public.newsletter_subscribers FOR ALL USING (
  public.is_admin()
);

CREATE TABLE public.feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  enabled     BOOLEAN DEFAULT false,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY flags_select ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY flags_admin ON public.feature_flags FOR ALL USING (
  public.is_admin()
);

CREATE TABLE public.role_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role        TEXT UNIQUE NOT NULL,
  permissions TEXT[] DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY roleperm_select ON public.role_permissions FOR SELECT USING (true);
CREATE POLICY roleperm_admin ON public.role_permissions FOR ALL USING (
  public.is_admin()
);

CREATE TABLE public.system_health (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component   TEXT NOT NULL,
  status      TEXT DEFAULT 'ok',
  message     TEXT,
  last_seen   TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY health_select ON public.system_health FOR SELECT USING (true);
CREATE POLICY health_write ON public.system_health FOR ALL USING (
  public.has_profile()
);

CREATE TABLE public.audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  action     TEXT NOT NULL,
  table_name TEXT,
  payload    JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON public.audit_log FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY audit_select ON public.audit_log FOR SELECT USING (
  public.is_staff()
);

-- ============================================================
-- MAINTENANCE SCHEDULE (future maintenance windows)
-- ============================================================
CREATE TABLE public.maintenance_schedule (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ,
  active      BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.maintenance_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY maint_sched_select ON public.maintenance_schedule FOR SELECT USING (true);
CREATE POLICY maint_sched_admin ON public.maintenance_schedule FOR ALL USING (
  public.is_admin()
);


-- ============================================================
-- TEAMS (future)
-- ============================================================
CREATE TABLE public.teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  owner_id   UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_select ON public.teams FOR SELECT USING (true);
CREATE POLICY teams_write ON public.teams FOR ALL USING (owner_id = auth.uid());

CREATE TABLE public.team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id),
  role       TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tmembers_select ON public.team_members FOR SELECT USING (true);
CREATE POLICY tmembers_write ON public.team_members FOR ALL USING (
  EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid())
);


-- ============================================================
-- REFERRALS
-- ============================================================
CREATE TABLE public.referrals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id),
  code        TEXT UNIQUE NOT NULL,
  uses        INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY ref_own ON public.referrals FOR ALL USING (referrer_id = auth.uid());
CREATE POLICY ref_admin ON public.referrals FOR ALL USING (
  public.is_admin()
);


-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, read);
CREATE INDEX idx_orders_tracking ON public.orders(tracking_code);
CREATE INDEX idx_audit_log_created ON public.audit_log(created_at DESC);
CREATE INDEX idx_chat_messages_channel ON public.chat_messages(channel, created_at DESC);
CREATE INDEX idx_beta_requests_status ON public.beta_requests(status);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_game_scores_game ON public.game_scores(game, score DESC);
CREATE INDEX idx_announcements_active ON public.announcements(active, pinned, created_at DESC);
CREATE INDEX idx_jobs_active ON public.jobs(active, created_at DESC);
