-- =============================================================================
-- xSyna COMPLETE FRESH SETUP
-- WARNUNG: Löscht den gesamten public-Schema inklusive aller Daten!
-- Im Supabase SQL-Editor ausführen.
-- =============================================================================

-- 0. Auth-Trigger zuerst entfernen (entfernt Abhängigkeit auf public.handle_new_user)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 1. Extensions entfernen, damit sie nach Schema-Reset sauber neu angelegt werden
DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
DROP EXTENSION IF EXISTS "pgcrypto" CASCADE;

-- 2. Public-Schema komplett zurücksetzen
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO anon, authenticated, service_role;

SET search_path = public;

-- 3. Extensions
CREATE EXTENSION "uuid-ossp";
CREATE EXTENSION "pgcrypto";

-- 3. CORE TABLES

CREATE TABLE public.profiles (
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

CREATE TABLE public.site_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tracking_key text,
  tracking_steps text[] DEFAULT '{}',
  brand_name text DEFAULT 'xSyna',
  default_locale text DEFAULT 'de',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.maintenance_mode (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  title text DEFAULT 'System wird aktualisiert...',
  status_text text DEFAULT 'Wir arbeiten an xSyna. Bitte hab einen Moment Geduld.',
  progress int DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  min_role text NOT NULL DEFAULT 'user' CHECK (min_role IN ('admin','moderator','beta','user')),
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.system_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric text NOT NULL,
  status text NOT NULL DEFAULT 'operational' CHECK (status IN ('operational','degraded','down','maintenance')),
  value text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 4. CONTENT TABLES

CREATE TABLE public.announcements (
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

CREATE TABLE public.jobs (
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

CREATE TABLE public.docs (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  content text NOT NULL DEFAULT '# xSyna Docs\n\nHier kannst du interne Dokumentation editieren.',
  updated_at timestamptz DEFAULT now()
);

-- 5. USER FEATURES

CREATE TABLE public.beta_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  product text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'Offen',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'Lead',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date text NOT NULL,
  description text,
  duration_ms bigint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text text NOT NULL,
  type text NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_preferences (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  notifications_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning','system')),
  read boolean NOT NULL DEFAULT false,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. ORDERS & TRACKING

CREATE TABLE public.orders (
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

CREATE TABLE public.order_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL,
  progress int NOT NULL DEFAULT 0,
  message text,
  created_at timestamptz DEFAULT now()
);

-- 7. MAINTENANCE & AUDIT

CREATE TABLE public.maintenance_schedule (
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

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text,
  record_id text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- 8. EXTERNAL WEBAPPS / OAUTH

CREATE TABLE public.web_apps (
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

CREATE TABLE public.web_app_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  app_id uuid REFERENCES public.web_apps(id) ON DELETE CASCADE NOT NULL,
  scopes text[] DEFAULT '{}',
  access_token_hash text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, app_id)
);

CREATE TABLE public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  key_hash text UNIQUE NOT NULL,
  scopes text[] DEFAULT '{read:profile}'::text[],
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 9. TEAMS & BILLING

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  billing_email text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  invited_email text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE TABLE public.billing_tiers (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  monthly_price numeric NOT NULL DEFAULT 0,
  token_quota bigint NOT NULL DEFAULT 0,
  features text[] DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  tier_id text REFERENCES public.billing_tiers(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled','past_due','trialing')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 10. AI / PLAYGROUND & ECOSYSTEM

CREATE TABLE public.inference_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  model_name text NOT NULL,
  prompt text,
  result text,
  tokens_used int NOT NULL DEFAULT 0,
  latency_ms int,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.usage_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  total_tokens bigint NOT NULL DEFAULT 0,
  api_calls int NOT NULL DEFAULT 0,
  inference_count int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (team_id, date)
);

CREATE TABLE public.quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  tier_id text REFERENCES public.billing_tiers(id),
  tokens_used bigint NOT NULL DEFAULT 0,
  tokens_limit bigint NOT NULL DEFAULT 0,
  period_start timestamptz DEFAULT now(),
  period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  storage_path text,
  size_bytes bigint,
  format text,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.tuning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  base_model text NOT NULL,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','training','completed','failed','cancelled')),
  output_model_name text,
  progress int NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  endpoint_url text NOT NULL,
  events text[] NOT NULL,
  secret text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid REFERENCES public.webhooks(id) ON DELETE CASCADE NOT NULL,
  event text NOT NULL,
  payload jsonb,
  response_status int,
  success boolean,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.published_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  model_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  base_model text,
  download_url text,
  downloads int NOT NULL DEFAULT 0,
  public boolean NOT NULL DEFAULT true,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  uses_left int,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 11. NEW CEO FEATURES (10)

CREATE TABLE public.game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  score int NOT NULL DEFAULT 0,
  level_reached text,
  nickname text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.synai_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Mini SynAI Chat',
  model text DEFAULT 'synai-mini',
  context jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.saved_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  prompt_text text NOT NULL,
  tags text[] DEFAULT '{}',
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  product text DEFAULT 'xSyna',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invited','converted','rejected')),
  invited_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text,
  message text NOT NULL,
  rating int CHECK (rating BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','closed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  resume_link text,
  status text NOT NULL DEFAULT 'review' CHECK (status IN ('review','interview','rejected','hired')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referred_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed_up','rewarded')),
  reward_paid boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  active boolean NOT NULL DEFAULT true,
  subscribed_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  device_info text,
  os text,
  browser text,
  last_active timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name text UNIQUE NOT NULL,
  permissions text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- 12. ROW LEVEL SECURITY - POLICIES

-- Helper function to read the current user's role without triggering RLS recursion.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  SELECT role INTO _role FROM public.profiles WHERE id = auth.uid();
  RETURN _role;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_mode ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_app_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inference_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.published_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.current_user_role() = 'admin');
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.current_user_role() = 'admin');
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT WITH CHECK (true);

-- site_config
CREATE POLICY "site_config_public_read" ON public.site_config FOR SELECT USING (true);
CREATE POLICY "site_config_admin_write" ON public.site_config FOR ALL
  USING (public.current_user_role() = 'admin');

-- maintenance_mode
CREATE POLICY "maintenance_public_read" ON public.maintenance_mode FOR SELECT USING (true);
CREATE POLICY "maintenance_admin_write" ON public.maintenance_mode FOR ALL
  USING (public.current_user_role() = 'admin');

-- feature_flags
CREATE POLICY "feature_flags_public_read" ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY "feature_flags_admin_write" ON public.feature_flags FOR ALL
  USING (public.current_user_role() = 'admin');

-- system_health
CREATE POLICY "system_health_public_read" ON public.system_health FOR SELECT USING (true);
CREATE POLICY "system_health_admin_write" ON public.system_health FOR ALL
  USING (public.current_user_role() = 'admin');

-- announcements
CREATE POLICY "announcements_public_read" ON public.announcements FOR SELECT USING (published = true);
CREATE POLICY "announcements_admin_write" ON public.announcements FOR ALL
  USING (public.current_user_role() = 'admin');

-- jobs
CREATE POLICY "jobs_public_read" ON public.jobs FOR SELECT USING (active = true);
CREATE POLICY "jobs_admin_write" ON public.jobs FOR ALL
  USING (public.current_user_role() = 'admin');

-- docs
CREATE POLICY "docs_public_read" ON public.docs FOR SELECT USING (true);
CREATE POLICY "docs_write" ON public.docs FOR ALL
  USING (public.current_user_role() IN ('admin','moderator'));

-- beta_requests
CREATE POLICY "beta_requests_self" ON public.beta_requests FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() IN ('admin','moderator'));

-- support_tickets
CREATE POLICY "support_tickets_self" ON public.support_tickets FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() IN ('admin','moderator'));

-- crm_contacts
CREATE POLICY "crm_contacts_all_read" ON public.crm_contacts FOR SELECT USING (true);
CREATE POLICY "crm_contacts_write" ON public.crm_contacts FOR ALL
  USING (public.current_user_role() IN ('admin','moderator'));

-- time_entries
CREATE POLICY "time_entries_self" ON public.time_entries FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

-- chat_messages
CREATE POLICY "chat_messages_self" ON public.chat_messages FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

-- user_preferences
CREATE POLICY "user_preferences_self" ON public.user_preferences FOR ALL USING (auth.uid() = id);

-- notifications
CREATE POLICY "notifications_self" ON public.notifications FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

-- orders
CREATE POLICY "orders_public_by_id" ON public.orders FOR SELECT USING (is_public = true);
CREATE POLICY "orders_staff_manage" ON public.orders FOR ALL
  USING (public.current_user_role() IN ('admin','moderator'));

-- order_updates
CREATE POLICY "order_updates_public" ON public.order_updates FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.is_public = true));
CREATE POLICY "order_updates_staff_manage" ON public.order_updates FOR ALL
  USING (public.current_user_role() IN ('admin','moderator'));

-- maintenance_schedule
CREATE POLICY "maintenance_schedule_public_read" ON public.maintenance_schedule FOR SELECT USING (true);
CREATE POLICY "maintenance_schedule_admin_write" ON public.maintenance_schedule FOR ALL
  USING (public.current_user_role() = 'admin');

-- audit_log
CREATE POLICY "audit_log_staff_read" ON public.audit_log FOR SELECT
  USING (public.current_user_role() IN ('admin','moderator'));
CREATE POLICY "audit_log_insert" ON public.audit_log FOR INSERT WITH CHECK (auth.uid() = user_id);

-- web_apps
CREATE POLICY "web_apps_public_read" ON public.web_apps FOR SELECT
  USING (public = true AND approved = true OR owner_id = auth.uid() OR public.current_user_role() = 'admin');
CREATE POLICY "web_apps_owner_write" ON public.web_apps FOR ALL
  USING (owner_id = auth.uid() OR public.current_user_role() = 'admin');

-- web_app_grants
CREATE POLICY "web_app_grants_self" ON public.web_app_grants FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

-- user_api_keys
CREATE POLICY "user_api_keys_self" ON public.user_api_keys FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

-- teams
CREATE POLICY "teams_member_read" ON public.teams FOR SELECT
  USING (owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = teams.id AND tm.user_id = auth.uid()) OR public.current_user_role() = 'admin');
CREATE POLICY "teams_owner_write" ON public.teams FOR ALL
  USING (owner_id = auth.uid() OR public.current_user_role() = 'admin');

-- team_members
CREATE POLICY "team_members_member_read" ON public.team_members FOR SELECT
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR user_id = auth.uid() OR public.current_user_role() = 'admin');
CREATE POLICY "team_members_owner_write" ON public.team_members FOR ALL
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND t.owner_id = auth.uid()) OR public.current_user_role() = 'admin');

-- billing_tiers
CREATE POLICY "billing_tiers_public_read" ON public.billing_tiers FOR SELECT USING (true);
CREATE POLICY "billing_tiers_admin_write" ON public.billing_tiers FOR ALL
  USING (public.current_user_role() = 'admin');

-- subscriptions
CREATE POLICY "subscriptions_team_read" ON public.subscriptions FOR SELECT
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR public.current_user_role() = 'admin');
CREATE POLICY "subscriptions_admin_write" ON public.subscriptions FOR ALL
  USING (public.current_user_role() = 'admin');

-- inference_logs
CREATE POLICY "inference_logs_self" ON public.inference_logs FOR ALL
  USING (user_id = auth.uid() OR team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR public.current_user_role() = 'admin');

-- usage_stats
CREATE POLICY "usage_stats_team_read" ON public.usage_stats FOR SELECT
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR public.current_user_role() = 'admin');

-- quotas
CREATE POLICY "quotas_team_read" ON public.quotas FOR SELECT
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR public.current_user_role() = 'admin');
CREATE POLICY "quotas_admin_write" ON public.quotas FOR ALL
  USING (public.current_user_role() = 'admin');

-- datasets
CREATE POLICY "datasets_team_access" ON public.datasets FOR ALL
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR public.current_user_role() = 'admin');

-- tuning_jobs
CREATE POLICY "tuning_jobs_team_access" ON public.tuning_jobs FOR ALL
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR public.current_user_role() = 'admin');

-- webhooks
CREATE POLICY "webhooks_team_access" ON public.webhooks FOR ALL
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR public.current_user_role() = 'admin');

-- webhook_deliveries
CREATE POLICY "webhook_deliveries_team_access" ON public.webhook_deliveries FOR SELECT
  USING (webhook_id IN (SELECT id FROM public.webhooks WHERE team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())) OR public.current_user_role() = 'admin');

-- published_models
CREATE POLICY "published_models_public_read" ON public.published_models FOR SELECT
  USING (public = true AND approved = true OR team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR public.current_user_role() = 'admin');
CREATE POLICY "published_models_team_write" ON public.published_models FOR ALL
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR public.current_user_role() = 'admin');

-- invite_codes
CREATE POLICY "invite_codes_team_read" ON public.invite_codes FOR SELECT
  USING (team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR public.current_user_role() = 'admin');
CREATE POLICY "invite_codes_admin_write" ON public.invite_codes FOR ALL
  USING (public.current_user_role() = 'admin');

-- game_scores
CREATE POLICY "game_scores_public_read" ON public.game_scores FOR SELECT USING (true);
CREATE POLICY "game_scores_self_write" ON public.game_scores FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

-- synai_sessions
CREATE POLICY "synai_sessions_self" ON public.synai_sessions FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

-- saved_prompts
CREATE POLICY "saved_prompts_public_read" ON public.saved_prompts FOR SELECT
  USING (is_public = true OR user_id = auth.uid() OR public.current_user_role() = 'admin');
CREATE POLICY "saved_prompts_self_write" ON public.saved_prompts FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

-- waitlist
CREATE POLICY "waitlist_public_insert" ON public.waitlist FOR INSERT WITH CHECK (true);
CREATE POLICY "waitlist_admin_all" ON public.waitlist FOR ALL
  USING (public.current_user_role() = 'admin');

-- feedback
CREATE POLICY "feedback_self" ON public.feedback FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() IN ('admin','moderator'));

-- applications
CREATE POLICY "applications_self" ON public.applications FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() IN ('admin','moderator'));

-- referrals
CREATE POLICY "referrals_self" ON public.referrals FOR ALL
  USING (referrer_id = auth.uid() OR public.current_user_role() = 'admin');

-- newsletter_subscribers
CREATE POLICY "newsletter_public_insert" ON public.newsletter_subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "newsletter_admin_all" ON public.newsletter_subscribers FOR ALL
  USING (public.current_user_role() = 'admin');

-- user_devices
CREATE POLICY "user_devices_self" ON public.user_devices FOR ALL
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

-- role_permissions
CREATE POLICY "role_permissions_public_read" ON public.role_permissions FOR SELECT USING (true);
CREATE POLICY "role_permissions_admin_write" ON public.role_permissions FOR ALL
  USING (public.current_user_role() = 'admin');

-- 13. INDEXES

CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_last_seen ON public.profiles(last_seen_at);
CREATE INDEX idx_beta_requests_user_id ON public.beta_requests(user_id);
CREATE INDEX idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX idx_time_entries_user_id ON public.time_entries(user_id);
CREATE INDEX idx_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX idx_announcements_published ON public.announcements(published, published_at);
CREATE INDEX idx_jobs_active ON public.jobs(active, published_at);
CREATE INDEX idx_maintenance_schedule_dates ON public.maintenance_schedule(starts_at, ends_at);
CREATE INDEX idx_audit_log_user ON public.audit_log(user_id, created_at);
CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, read, created_at);
CREATE INDEX idx_web_apps_slug ON public.web_apps(slug);
CREATE INDEX idx_web_apps_owner ON public.web_apps(owner_id);
CREATE INDEX idx_web_app_grants_user ON public.web_app_grants(user_id);
CREATE INDEX idx_user_api_keys_hash ON public.user_api_keys(key_hash);
CREATE INDEX idx_teams_owner ON public.teams(owner_id);
CREATE INDEX idx_team_members_user ON public.team_members(user_id);
CREATE INDEX idx_team_members_team ON public.team_members(team_id);
CREATE INDEX idx_subscriptions_team ON public.subscriptions(team_id);
CREATE INDEX idx_inference_logs_user ON public.inference_logs(user_id);
CREATE INDEX idx_inference_logs_team ON public.inference_logs(team_id);
CREATE INDEX idx_usage_stats_team_date ON public.usage_stats(team_id, date);
CREATE INDEX idx_quotas_team ON public.quotas(team_id);
CREATE INDEX idx_datasets_team ON public.datasets(team_id);
CREATE INDEX idx_tuning_jobs_team ON public.tuning_jobs(team_id);
CREATE INDEX idx_webhooks_team ON public.webhooks(team_id);
CREATE INDEX idx_published_models_slug ON public.published_models(slug);
CREATE INDEX idx_invite_codes_code ON public.invite_codes(code);
CREATE INDEX idx_game_scores_score ON public.game_scores(score DESC);
CREATE INDEX idx_waitlist_status ON public.waitlist(status, created_at);
CREATE INDEX idx_feedback_status ON public.feedback(status, created_at);
CREATE INDEX idx_saved_prompts_user ON public.saved_prompts(user_id);
CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX idx_user_devices_user ON public.user_devices(user_id);
CREATE INDEX idx_newsletter_email ON public.newsletter_subscribers(email);
CREATE INDEX idx_role_permissions_name ON public.role_permissions(role_name);

-- 14. AUTH TRIGGER (must run after audit_log exists)

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
  );

  IF is_first_user THEN
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, payload)
    VALUES (new.id, 'SUPERUSER_CREATED', 'profiles', new.id::text, jsonb_build_object('email', new.email));
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 15. DEFAULT DATA

INSERT INTO public.site_config (id, tracking_key, tracking_steps)
VALUES (1, 'xsyna-default-tracking-key-32', ARRAY['Eingegangen','In Bearbeitung','Qualitätskontrolle','Abgeschlossen']);

INSERT INTO public.maintenance_mode (id, enabled, title, status_text, progress)
VALUES (1, false, 'System wird aktualisiert...', 'Wir arbeiten an xSyna. Bitte hab einen Moment Geduld.', 0);

INSERT INTO public.feature_flags (key, label, description, enabled, min_role)
VALUES
  ('webapps_directory', 'WebApp-Verzeichnis', 'Externe App-Directory im Account-Panel anzeigen', true, 'user'),
  ('api_keys', 'API-Keys', 'Persönliche API-Keys im Account verwalten', true, 'user'),
  ('notifications', 'Benachrichtigungen', 'Benachrichtigungs-Inbox aktivieren', true, 'user'),
  ('mini_synai', 'Mini SynAI', 'Mini SynAI Experiment aktivieren', true, 'user'),
  ('xyna_game', 'xSyna Game', 'xSyna Spiel aktivieren', true, 'user'),
  ('teams', 'Teams', 'Team-Workspaces aktivieren', true, 'user'),
  ('billing', 'Billing', 'Abonnements und Billing aktivieren', true, 'user'),
  ('inference_playground', 'Inference Playground', 'KI-Inference-Playground aktivieren', true, 'user'),
  ('model_hub', 'Model Hub', 'Community Model Hub aktivieren', true, 'user'),
  ('saved_prompts', 'Prompt-Bibliothek', 'Prompt-Bibliothek im Panel aktivieren', true, 'user'),
  ('waitlist', 'Waitlist', 'Waitlist aktivieren', true, 'user'),
  ('feedback', 'Feedback', 'Feedback aktivieren', true, 'user'),
  ('newsletter', 'Newsletter', 'Newsletter-Subscribers aktivieren', true, 'user');

INSERT INTO public.billing_tiers (id, name, description, monthly_price, token_quota, features)
VALUES
  ('free', 'Free', 'Kostenlos für Hobby-Projekte', 0, 10000, ARRAY['128 Neuronen','10k Tokens/Monat','Community Support']),
  ('pro', 'Pro', 'Für professionelle Nutzer', 29, 100000, ARRAY['1k Neuronen','100k Tokens/Monat','API-Zugang','E-Mail Support']),
  ('enterprise', 'Enterprise', 'Für Teams und Unternehmen', 299, 1000000, ARRAY['Unlimitierte Neuronen','1M Tokens/Monat','SSO','Premium Support','Custom Models']);

INSERT INTO public.role_permissions (role_name, permissions)
VALUES
  ('admin', ARRAY['*']),
  ('moderator', ARRAY['users.read','beta.manage','support.manage','content.write','crm.manage']),
  ('beta', ARRAY['beta.access','playground.access']),
  ('user', ARRAY['account.read','account.write']);

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

-- 16. FINAL PRIVILEGES

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
