-- 015_slug_guard_trigger.sql — auto-number any task inserted with a non-numeric
-- legacy_id (e.g. /meeting append-actions slugs like
-- "zaal-x-dcoop-...-2026-06-08"), so every task gets a clean numeric ?task=<N>
-- link automatically — no change needed to any external writer.
--
-- WHY: a task's app-facing id is its legacy_id, and that id IS the URL/route key
-- (?task=<id>). The /meeting flow (append-actions / zao-tracker) writes rows
-- straight into Supabase with legacy_source='meeting:<slug>-<date>' and a slug
-- as the legacy_id, which surfaces as ugly, un-typeable links and sorts to the
-- bottom of the numbered board. 014 renumbers the rows already present; this
-- trigger keeps every FUTURE insert clean with zero changes to the writer.
--
-- SAFE: nothing upserts on tasks(legacy_source, legacy_id) — the meeting flow
-- does plain INSERTs and the app updates rows by UUID (dbId). So reassigning
-- legacy_id on insert can never cause a re-insert / duplicate.
--
-- The original slug is preserved in metadata.source_slug so old
-- ?task=<slug> links can still be resolved if needed.
--
-- IDEMPOTENT. Apply AFTER 014 (which renumbers the existing slug rows).
-- Apply with `supabase db push` (or paste into the Supabase SQL editor).
-- Verify afterward:
--   select count(*) from tasks where legacy_id is null or legacy_id !~ '^[0-9]+$';
--   -- expect 0

-- Sequence that allocates numeric ids, seeded above the current global max.
CREATE SEQUENCE IF NOT EXISTS tasks_legacy_id_seq;
SELECT setval(
  'tasks_legacy_id_seq',
  GREATEST(
    (SELECT COALESCE(MAX(legacy_id::bigint), 0) FROM tasks WHERE legacy_id ~ '^[0-9]+$'),
    1
  )
);

CREATE OR REPLACE FUNCTION tasks_slug_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.legacy_id IS NULL OR NEW.legacy_id !~ '^[0-9]+$' THEN
    -- Preserve the original slug so old ?task=<slug> links can still be resolved.
    IF NEW.legacy_id IS NOT NULL THEN
      NEW.metadata := jsonb_set(
        COALESCE(NEW.metadata, '{}'::jsonb),
        '{source_slug}', to_jsonb(NEW.legacy_id), true
      );
    END IF;
    -- nextval is monotonic + unique, so multi-row meeting inserts never collide.
    NEW.legacy_id := nextval('tasks_legacy_id_seq')::text;
  ELSE
    -- App tasks write numeric legacy_ids directly (newId() = max+1), bypassing
    -- the sequence. Keep the sequence ahead of them so future allocations can't
    -- collide with an app-assigned id.
    IF NEW.legacy_id::bigint > (SELECT last_value FROM tasks_legacy_id_seq) THEN
      PERFORM setval('tasks_legacy_id_seq', NEW.legacy_id::bigint);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_slug_guard_trg ON tasks;
CREATE TRIGGER tasks_slug_guard_trg
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_slug_guard();
