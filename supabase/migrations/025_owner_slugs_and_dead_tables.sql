-- 025_owner_slugs_and_dead_tables.sql
-- Audit round 2 (2026-07-26). Schema + identity only; no task data is touched.
-- See 026 for the due-date backfill, which is a data change and runs separately.

-- ============================================================
-- A. Canonicalise team_members.legacy_owner to a lowercase slug
-- ============================================================
-- Casing was inconsistent: "Zaal"/"Iman"/"ThyRev"/"Samantha"/"Tyler" were
-- capitalised while "aziz"/"dcoop"/"jango"/"jose"/"metamu"/"nemesis"/
-- "ohnahji"/"shawn"/"vishnu" were lowercase. Nothing was functionally broken
-- (effectiveAssignees/isAssignedTo lowercase both sides), but it meant the
-- value could not be compared with `===` anywhere, and group-by-owner rendered
-- "dcoop" next to "Zaal".
--
-- legacy_owner is now the canonical lowercase slug. Display names come from
-- team_members.name via ownerLabel() - see src/lib/team-options.ts.
update public.team_members
   set legacy_owner = lower(btrim(legacy_owner))
 where legacy_owner is not null
   and legacy_owner <> lower(btrim(legacy_owner));

-- Guard against re-introducing mixed case from the admin UI or a bot.
alter table public.team_members
  drop constraint if exists team_members_legacy_owner_lowercase;
alter table public.team_members
  add constraint team_members_legacy_owner_lowercase
  check (legacy_owner is null or legacy_owner = lower(btrim(legacy_owner)));

-- tasks.owner_id is a uuid FK, so no task rows need rewriting: the owner string
-- the app renders is derived from team_members at read time.

-- ============================================================
-- B. Drop agent_instances - genuinely dead
-- ============================================================
-- Zero rows and zero references anywhere in the repo (src/, agent/, scripts/,
-- migrations). Superseded by bot_heartbeats, which is live with 5 rows and is
-- what /bots actually reads.
--
-- Deliberately NOT dropped, despite also being empty:
--   meetings        - migration 017, fully wired to the calendar UI, Google
--                     Calendar push and email invites (src/lib/meetings.ts).
--                     It is not a duplicate of meeting_notes; that table holds
--                     read-only research recaps. Different features.
--   task_proposals  - fully wired (src/lib/proposals.ts, /admin/proposals,
--                     /api/proposals/suggest-brands). It models field-EDIT
--                     proposals (set_brands, set_owner, ...), which is
--                     unrelated to tasks carrying source='ai-proposal'.
--   sponsors, artists, volunteers, budget_entries, goals, suggestions,
--   contact_log, circles, circle_members - ZAOstock festival ops, pre-built
--                     for Oct 3. Empty because that planning has not moved into
--                     this DB yet, not because they are abandoned.
drop table if exists public.agent_instances;
