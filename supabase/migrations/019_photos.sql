-- 019_photos.sql — Photo dashboard (docs/superpowers/specs/2026-07-13-photo-dashboard-design.md).
--
-- NOTE: this migration is a retroactive record. The `photos` table and its
-- Storage bucket were applied by hand in the Supabase dashboard SQL editor on
-- 2026-07-13 (the write-mode MCP connection wasn't available in that
-- session) - this file exists so the live schema is no longer undocumented
-- in git, per docs/MIGRATIONS.md's "Known drift" section. If you're running
-- this fresh, `CREATE TABLE IF NOT EXISTS` / `ON CONFLICT DO NOTHING` make
-- it safe to apply even though the table already exists in production.
--
-- A photo queued for posting to Fotocaster (a third-party Farcaster photo
-- app - posting there stays a manual action, no API integration exists).
-- Status lifecycle: draft -> ready -> posted. Once posted, collector_handle/
-- question/question_status/livestream_* fields are filled in by hand as
-- Zaal spots activity on Farcaster - no automated detection.

CREATE TABLE IF NOT EXISTS photos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path      TEXT NOT NULL,
  caption           TEXT NOT NULL,
  credit            TEXT,
  event             TEXT,
  photo_date        DATE,
  price_usd         NUMERIC(10,2) NOT NULL DEFAULT 5.00,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','posted')),
  fotocaster_url    TEXT,
  collected         BOOLEAN NOT NULL DEFAULT false,
  collector_handle  TEXT,
  question          TEXT,
  question_status   TEXT NOT NULL DEFAULT 'none' CHECK (question_status IN ('none','received','scheduled','answered')),
  livestream_time   TIMESTAMPTZ,
  livestream_url    TEXT,
  created_by        UUID REFERENCES team_members(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photos_select_authenticated" ON photos;
CREATE POLICY "photos_select_authenticated" ON photos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "photos_write_service_role" ON photos;
CREATE POLICY "photos_write_service_role" ON photos
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', false)
ON CONFLICT (id) DO NOTHING;
