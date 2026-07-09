-- 014: team routing columns (doc 989 / PR #124).
-- PR #124 shipped the /admin team pickers + SELECT of primary_team/secondary_team
-- but never added a migration, so on prod the columns were missing and
-- listTeamMembers() threw "column does not exist" -> the whole Users panel came
-- back empty ("cant see my users", 2026-07-09). Additive + idempotent.
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS primary_team text;
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS secondary_team text;
