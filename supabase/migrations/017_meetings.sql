-- 017_meetings.sql — Meetings/events on the cowork board.
--
-- A meeting is a scheduled event distinct from a task: it has a start/end time,
-- attendees (team members + outside emails), an optional location/video link,
-- and an agenda. Meetings show on the calendar alongside tasks, push to a shared
-- Google Calendar (when configured), and email .ics invites to attendees.
--
-- Attendees are stored inline as jsonb (small lists, always read with the
-- meeting) — each: { id: slug|email, name, email?, response: pending|yes|no|maybe }.

CREATE TABLE IF NOT EXISTS meetings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  location        TEXT NOT NULL DEFAULT '',        -- room, address, or video link
  attendees       JSONB NOT NULL DEFAULT '[]',     -- [{ id, name, email?, response }]
  brands          TEXT[] NOT NULL DEFAULT '{}',    -- optional brand tags (mirrors tasks)
  created_by      TEXT NOT NULL,
  google_event_id TEXT,                            -- set after a successful GCal push
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Calendar reads scan by start time.
CREATE INDEX IF NOT EXISTS meetings_starts_at_idx ON meetings (starts_at);
