-- 002_brands_table.sql
-- Move the brand vocabulary from src/lib/brands.ts (hardcoded const) into a
-- Supabase table so admins can add/retire brands from /admin without a code
-- change.
--
-- Design notes:
-- - `name` is the canonical display string (e.g. "ZAO Devz"). Unique.
-- - `slugs` is the array of hashtag aliases that resolve to this brand
--   (e.g. ['zaodevz','zao-devz','devz']). NL parser reads these for
--   hashtag-to-brand resolution.
-- - `color` stores the Tailwind class string used by the card chip + tab.
--   Default is the neutral fallback; admins can paste in a brand color
--   class set when adding a new brand.
-- - `sort_order` drives whether a brand renders as a primary top-row tab
--   (< 100) or sits in the "More" dropdown (>= 100). Hardcoded NavBar
--   primary brands keep their slots via low sort_order seeds.
-- - `active=false` hides the brand from tabs + filters but keeps tasks
--   tagged with it intact (we never auto-untag).
--
-- The Phase D server-page reads (listActiveBrands) fall back to an empty
-- list if this table doesn't exist yet, so the site still renders against
-- the hardcoded const until this migration is applied.

CREATE TABLE IF NOT EXISTS brands (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  slugs       TEXT[] NOT NULL DEFAULT '{}',
  color       TEXT NOT NULL DEFAULT 'bg-white/10 text-white/70 border-white/20',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  TEXT
);

CREATE INDEX IF NOT EXISTS brands_active_sort_idx ON brands(active, sort_order);

-- Seed: every brand in src/lib/brands.ts as of 2026-05-26. Slugs match the
-- BRAND_SLUGS map in that file. Sort orders 10..60 = primary tabs (matches
-- the PRIMARY_BRANDS list in NavBar before this migration); 100+ = More
-- dropdown. The Phase D NavBar will switch from hardcoded PRIMARY_BRANDS to
-- "any brand with sort_order < 100" as the primary cohort.

INSERT INTO brands (name, slugs, color, sort_order) VALUES
  ('The ZAO',         ARRAY['zao','the-zao','thezao'],                    'bg-indigo-600/30 text-indigo-200 border-indigo-500/40',  10),
  ('ZAO Devz',        ARRAY['zaodevz','zao-devz','devz'],                 'bg-slate-600/30 text-slate-200 border-slate-500/40',     20),
  ('ZAOstock',        ARRAY['zaostock','zao-stock'],                      'bg-amber-600/30 text-amber-200 border-amber-500/40',     30),
  ('WaveWarZ',        ARRAY['wavewarz','wavewars','ww'],                  'bg-cyan-600/30 text-cyan-200 border-cyan-500/40',        40),
  ('COC Concertz',    ARRAY['coc','coc-concertz'],                        'bg-red-600/30 text-red-200 border-red-500/40',           50),
  ('ZABAL Games',     ARRAY['zabal-games','zabalgames','games'],          'bg-fuchsia-600/30 text-fuchsia-200 border-fuchsia-500/40', 60),
  ('ZAO Festivals',   ARRAY['zao-festivals','festivals'],                 'bg-amber-700/30 text-amber-200 border-amber-600/40',     110),
  ('ZAO-PALOOZA',     ARRAY['zao-palooza','zaopalooza','palooza'],        'bg-amber-700/30 text-amber-200 border-amber-600/40',     120),
  ('ZAO-CHELLA',      ARRAY['zao-chella','zaochella','chella'],           'bg-amber-700/30 text-amber-200 border-amber-600/40',     130),
  ('ZABAL',           ARRAY['zabal'],                                     'bg-fuchsia-700/30 text-fuchsia-200 border-fuchsia-600/40', 140),
  ('BetterCallZaal',  ARRAY['bcz','bettercallzaal'],                      'bg-emerald-600/30 text-emerald-200 border-emerald-500/40', 150),
  ('BCZ Strategies',  ARRAY['bcz-strategies','strategies'],               'bg-emerald-700/30 text-emerald-200 border-emerald-600/40', 160),
  ('ZAO Music',       ARRAY['zao-music','zaomusic','music'],              'bg-rose-600/30 text-rose-200 border-rose-500/40',        170),
  ('ZOUNZ',           ARRAY['zounz'],                                     'bg-rose-700/30 text-rose-200 border-rose-600/40',        180),
  ('FISHBOWLZ',       ARRAY['fishbowlz','fb'],                            'bg-teal-600/30 text-teal-200 border-teal-500/40',        190),
  ('POIDH',           ARRAY['poidh'],                                     'bg-yellow-600/30 text-yellow-200 border-yellow-500/40',  200),
  ('ZOE',             ARRAY['zoe'],                                       'bg-violet-600/30 text-violet-200 border-violet-500/40',  210),
  ('Hermes',          ARRAY['hermes'],                                    'bg-violet-700/30 text-violet-200 border-violet-600/40',  220),
  ('Bonfire',         ARRAY['bonfire'],                                   'bg-orange-600/30 text-orange-200 border-orange-500/40',  230),
  ('Juke',            ARRAY['juke'],                                      'bg-pink-600/30 text-pink-200 border-pink-500/40',        240)
ON CONFLICT (name) DO NOTHING;
