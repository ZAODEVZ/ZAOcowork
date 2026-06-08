-- 014_renumber_legacy_ids.sql — give every task a clean numeric ID.
--
-- WHY: a task's app-facing id is its `legacy_id`, and that id IS the URL/route
-- key (?task=<id> and /todo/<id>). Most tasks have a plain number (e.g. "267"),
-- but rows imported from other pipelines (meeting captures like
-- "meeting-jose-onb-0603-watchwkshp", and any row with a NULL legacy_id that
-- falls back to its UUID) showed up with ugly, un-typeable links and sorted to
-- the bottom of the numbered board. This renumbers them so every task has a
-- short, understandable numeric link.
--
-- WHAT IT DOES: finds the current GLOBAL maximum numeric legacy_id across ALL
-- rows, then assigns the next sequential numbers (max+1, max+2, …) to every row
-- whose legacy_id is NULL or not purely numeric, ordered by created_at so the
-- numbering follows creation order. Because the new numbers are strictly greater
-- than every existing numeric id in any source, there is no collision with
-- existing ids — neither under a UNIQUE(legacy_source, legacy_id) constraint nor
-- in the app's flattened (cross-source) id space — and the app's newId() will
-- keep counting up from the new max for future tasks.
--
-- IDEMPOTENT: re-running is a no-op once no non-numeric rows remain.
--
-- ⚠️ ONE-WAY for links: old slug links (e.g.
--    https://www.thezao.xyz/?task=meeting-jose-onb-0603-watchwkshp) will no
--    longer resolve after this runs. That was an explicit decision (clean
--    numbers over preserving rarely-shared slug URLs).
--
-- ⚠️ EXTERNAL PIPELINES: if a meeting-capture / bot pipeline upserts rows by
--    (legacy_source, legacy_id) using the OLD slug, it may re-insert the task
--    under its original slug after this migration. If such a pipeline exists,
--    point it at the new numeric ids (or the row's UUID) before/after applying.
--
-- Apply with `supabase db push` (or paste in the Supabase SQL editor — the
-- read-only MCP can't run DML). Verify afterward:
--   select count(*) from tasks where legacy_id is null or legacy_id !~ '^[0-9]+$';
--   -- expect 0

WITH base AS (
  SELECT COALESCE(MAX(legacy_id::bigint), 0) AS maxid
  FROM tasks
  WHERE legacy_id ~ '^[0-9]+$'
),
to_fix AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY created_at NULLS FIRST, id) AS rn
  FROM tasks
  WHERE legacy_id IS NULL OR legacy_id !~ '^[0-9]+$'
)
UPDATE tasks t
SET legacy_id = (b.maxid + f.rn)::text
FROM to_fix f
CROSS JOIN base b
WHERE t.id = f.id;
