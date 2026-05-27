-- 004_service_class_archive_triage.sql
-- Schema additions to support doc 763 improvements (Phase F):
--   - F2: service_class column (Standard/FixedDate/Expedite/Intangible)
--   - F4: archived_at column + auto-archive logic in app code
--   - F6: TRIAGE status (added to existing status enum; app code defaults
--     external writers to TRIAGE so leads can route before TODO)
--
-- All operations idempotent so this can be re-run safely.

-- ============== F2: service_class ==============
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS service_class TEXT NOT NULL DEFAULT 'Standard'
  CHECK (service_class IN ('Standard', 'FixedDate', 'Expedite', 'Intangible'));

-- Backfill: derive sane defaults from existing priority + due date so the new
-- column reflects reality on day one rather than everything being 'Standard'.
UPDATE tasks SET service_class = 'Expedite'
  WHERE priority = 'P1' AND status IN ('TODO', 'WIP', 'BLOCKED')
    AND service_class = 'Standard';

UPDATE tasks SET service_class = 'FixedDate'
  WHERE due IS NOT NULL AND due <> '' AND due <> 'null'
    AND service_class = 'Standard';

UPDATE tasks SET service_class = 'Intangible'
  WHERE (category = 'Tech Debt' OR title ILIKE '%refactor%' OR title ILIKE '%cleanup%' OR title ILIKE '%tech debt%')
    AND service_class = 'Standard';

CREATE INDEX IF NOT EXISTS tasks_service_class_idx ON tasks(service_class);

-- ============== F4: archived_at ==============
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS tasks_archived_at_idx ON tasks(archived_at) WHERE archived_at IS NULL;

-- ============== F6: TRIAGE status ==============
-- The tasks.status column is TEXT with no check constraint in current schema
-- (verified via REST query 2026-05-26), so we don't need an ALTER CHECK here.
-- App code uses STATUSES = ['TODO','WIP','BLOCKED','DONE'] - we add 'TRIAGE'
-- on the app side. No DDL needed for this part, but documenting here so the
-- migration tells the full story.

-- ============== Add Tyler to team_members (audit doc 762 NEW-finding) ==============
-- Tyler Stambaugh was added to env-var auth via PR #13 but never inserted
-- into team_members, so /admin Users panel can't list him + DB-driven
-- owner dropdowns don't include him.
INSERT INTO team_members (name, legacy_owner, role, active)
SELECT 'Tyler', 'Tyler', 'worker', true
WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE legacy_owner = 'Tyler');
