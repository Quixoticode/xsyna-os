-- ============================================================
-- xSyna — Rezeptliste (Recipe List) WebApp
-- Tables: recipe_inventory, recipes, shopping_lists
-- Run AFTER 001_complete_schema.sql (profiles + helper fns).
-- Idempotent: safe to re-run.
-- ============================================================

-- Guard: ensure is_admin() helper exists (mirrors 001 signature)
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

-- ------------------------------------------------------------
-- INVENTORY — was ist vorrätig
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recipe_inventory (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL,
  amount     NUMERIC,
  unit       TEXT DEFAULT '',
  category   TEXT DEFAULT 'Sonstiges',
  source     TEXT DEFAULT 'manual',            -- manual | camera | mic | recipe
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.recipe_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY inv_own ON public.recipe_inventory
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY inv_admin ON public.recipe_inventory
  FOR ALL USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_recipe_inventory_user ON public.recipe_inventory(user_id, name);

-- ------------------------------------------------------------
-- RECIPES — eigene + öffentliche Rezepte
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recipes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title        TEXT NOT NULL,
  servings     INTEGER DEFAULT 2,
  ingredients  JSONB DEFAULT '[]'::jsonb,     -- [{name, amount, unit, category}]
  instructions TEXT DEFAULT '',
  tags         TEXT[] DEFAULT '{}',
  is_public    BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY recipes_select ON public.recipes
  FOR SELECT USING (user_id = auth.uid() OR is_public = true OR public.is_admin());
CREATE POLICY recipes_write ON public.recipes
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());

CREATE INDEX IF NOT EXISTS idx_recipes_title ON public.recipes(title);

-- ------------------------------------------------------------
-- SHOPPING LISTS — gespeicherte Einkaufslisten
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shopping_lists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title      TEXT DEFAULT 'Einkaufsliste',
  items      JSONB DEFAULT '[]'::jsonb,       -- [{name, amount, unit, category, done}]
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY lists_own ON public.shopping_lists
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY lists_admin ON public.shopping_lists
  FOR ALL USING (public.is_admin());

-- ------------------------------------------------------------
-- WEB_APPS: fehlende Spalten ergänzen (App-Directory nutzt sie)
-- ------------------------------------------------------------
ALTER TABLE public.web_apps ADD COLUMN IF NOT EXISTS "public" BOOLEAN DEFAULT false;
ALTER TABLE public.web_apps ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT true;

-- ------------------------------------------------------------
-- SEED — App im App-Directory registrieren
-- ------------------------------------------------------------
INSERT INTO public.web_apps (name, description, url, icon, category, active, "public", approved)
SELECT 'Rezeptliste',
       'Bestand verwalten, Rezepte finden und Einkaufslisten smart erstellen – powered by Synaptic Foundation Model.',
       '/recipe-list',
       '/recipe-list-icon.svg',
       'productivity',
       true,
       true,
       true
WHERE NOT EXISTS (SELECT 1 FROM public.web_apps WHERE url = '/recipe-list');
