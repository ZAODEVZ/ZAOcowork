-- 007_task_source_cache.sql
-- Board context Module 1: cache GitHub PR live-state so the board renders
-- without per-row GitHub calls. Idempotent.
CREATE TABLE IF NOT EXISTS task_source_cache (
  ref_kind   TEXT NOT NULL,          -- 'pr'
  ref_id     TEXT NOT NULL,          -- PR number as text
  state      TEXT,                   -- 'open' | 'closed' | 'merged'
  title      TEXT,
  url        TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ref_kind, ref_id)
);
CREATE INDEX IF NOT EXISTS task_source_cache_fetched_idx
  ON task_source_cache(fetched_at);
