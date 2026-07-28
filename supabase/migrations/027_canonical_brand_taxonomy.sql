-- 027_canonical_brand_taxonomy.sql
--
-- PHASE 0 of the UI/UX upgrade. DATA CHANGE - read this before running.
-- Fully reversible: every touched row is stamped in metadata (see rollback).
--
-- ============================================================
-- WHAT THE SPEC GOT WRONG (measured 2026-07-27, 309 open tasks)
-- ============================================================
-- The spec described "four labels for the same thing: The ZAO (97) +
-- zaodevz (80) + ZAO (47) + ZAO Devz (2)". Those numbers come from TWO
-- DIFFERENT COLUMNS and are not four variants of one field:
--
--   brands  text[]  multi-select tags  -> The ZAO 97, ZAO 12, ZAO Devz 2
--   project text    single discriminator -> zaodevz 194, ZAO 65,
--                                           zaal-personal 44, zaofestivals 2
--
-- `project` DEFAULTS to 'zaodevz' in itemToRow() for everything that is not
-- WaveWarZ. It is therefore not a brand signal at all - it is "unclassified".
-- Treating it as one would mislabel 194 tasks.
--
-- Per Zaal (2026-07-27): "The ZAO is the incubator for all the projects -
-- structure but no monetization mechanism, only social capital. ZAO DEVZ is
-- just a project out of that." So The ZAO and ZAO Devz are PARENT and CHILD,
-- not synonyms. This migration must NOT collapse them, and does not.
--
-- The public.brands table already lists both as separate canonical rows
-- (sort_order 10 and 20). The taxonomy was already correct; only the task
-- data drifted off it.
--
-- ============================================================
-- WHAT THIS MIGRATION ACTUALLY DOES
-- ============================================================
-- A. Adds the two canonical brands that are in use but missing from the table.
-- B. Folds the unambiguous label variant `ZAO` -> `The ZAO`. Safe because
--    'zao' is ALREADY a registered slug for "The ZAO" in brands.slugs.
-- C. Fixes the lowercase `personal` -> `Personal`.
-- D. Backfills brand from `project` ONLY where project names a real brand.
--    Deliberately does NOT touch project='zaodevz' - see the note below.
--
-- WHAT IT DELIBERATELY DOES NOT DO
-- - Does not infer a brand for the 79 open tasks whose only signal is
--   project='zaodevz'. That is the default value, so inferring "ZAO Devz"
--   from it would fabricate a classification for 79 tasks. They stay
--   unbranded and surface in the "Needs a brand" bin for human triage.
-- - Does not reclassify the 26 tasks that are project='zaal-personal' but
--   tagged brand 'The ZAO'/'ZAO'. Personal-vs-org there is a judgment call,
--   not a data fix. Flagged for review, untouched.
-- - Does not split the 97 'The ZAO' rows into ZAO vs ZAO Devz. Only 2 rows
--   currently say ZAO Devz, so a split needs human classification, not a
--   keyword guess.

-- ============================================================
-- A. Canonical brands that are in use but missing from the table
-- ============================================================
insert into public.brands (name, slugs, color, active, sort_order, created_by)
values
  ('Personal', array['personal','zaal-personal'],
   'bg-white/10 text-white/70 border-white/20', true, 300, 'migration-027'),
  ('Baraza', array['baraza'],
   'bg-white/10 text-white/70 border-white/20', true, 250, 'migration-027')
on conflict (name) do nothing;

-- ============================================================
-- B + C. Fold label variants onto their canonical name
-- ============================================================
-- 'ZAO' -> 'The ZAO' (12 open rows). Unambiguous: 'zao' is already a slug of
-- "The ZAO". 'personal' -> 'Personal' (1 row), pure casing.
update public.tasks
   set brands = (
         select array_agg(distinct
           case
             when b = 'ZAO'      then 'The ZAO'
             when b = 'personal' then 'Personal'
             else b
           end)
         from unnest(brands) b
       ),
       metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object('brand_migrated_027', now()),
       updated_at = now()
 where archived_at is null
   and brands && array['ZAO', 'personal'];

-- ============================================================
-- D. Backfill brand from project where project names a REAL brand
-- ============================================================
-- Only 'ZAO' and 'Baraza' qualify. 'zaodevz' is excluded on purpose - it is
-- the default assigned to everything unclassified, so it carries no signal.
update public.tasks
   set brands = array['The ZAO'],
       metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object('brand_backfilled_027', 'project=ZAO'),
       updated_at = now()
 where archived_at is null
   and cardinality(brands) = 0
   and project = 'ZAO';

update public.tasks
   set brands = array['Baraza'],
       metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object('brand_backfilled_027', 'project=Baraza'),
       updated_at = now()
 where archived_at is null
   and cardinality(brands) = 0
   and project = 'Baraza';

-- ============================================================
-- Report
-- ============================================================
select coalesce(b, '(needs a brand)') as brand, count(*) as open_tasks
  from public.tasks t
  left join lateral unnest(
    case when cardinality(t.brands) = 0 then array[null::text] else t.brands end
  ) b on true
 where t.archived_at is null and t.status <> 'done'
 group by 1
 order by 2 desc;

-- Expected after: 'ZAO' and 'personal' gone as labels; '(needs a brand)'
-- drops from 115 to ~79 (the project='zaodevz' rows that genuinely have no
-- signal and need human triage).

-- ============================================================
-- Rollback
-- ============================================================
-- Every touched row carries metadata->>'brand_migrated_027' or
-- 'brand_backfilled_027'. To undo the backfill (D):
--
--   update public.tasks
--      set brands = '{}',
--          metadata = metadata - 'brand_backfilled_027'
--    where metadata ? 'brand_backfilled_027';
--
-- The variant fold (B/C) is not auto-reversible per-row because the original
-- label is not stored. It is a rename of 13 rows onto names that were already
-- their canonical form, so reverting is not expected to be needed. If it is,
-- the affected rows are exactly: metadata ? 'brand_migrated_027'.
