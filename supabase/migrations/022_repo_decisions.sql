-- 022_repo_decisions.sql
-- Persistent keep/archive decisions for the /repos estate view.
-- Before this, repo triage lived in throwaway HTML/clipboard files that died
-- each session. This makes the walkthrough land on the dashboard permanently:
-- /repos opens pre-triaged with Zaal's recommendations, and each decision
-- (keep / archive / pending) sticks. Archiving the actual repo stays a manual
-- GitHub settings action (gated) - this table records the DECISION only.

create table if not exists repo_decisions (
  repo_name   text primary key,
  decision    text not null default 'pending' check (decision in ('keep', 'archive', 'pending')),
  note        text,
  decided_by  text,
  decided_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table repo_decisions is 'Keep/archive decisions surfaced on /repos. Decision is durable; actual GitHub archive is manual.';

-- Seed: recommendations from the 2026-07-20 repo walkthrough (136 active repos).
-- decision=archive for the two unambiguous buckets:
--   1. dead >8mo (no push in 8+ months)
--   2. explicit old versions (superseded by a live successor)
-- Plus stale duplicates whose successor is a kept, active repo.
-- Everything NOT listed here is undecided (shows as pending / keep-by-default) -
-- those are the "check" band Zaal walks through on the page.
insert into repo_decisions (repo_name, decision, note, decided_by) values
  -- dead >8mo
  ('wwtest1',                    'archive', 'dead >8mo. Confirmed private (not a key leak).', 'walkthrough'),
  ('Viz1',                       'archive', 'dead >8mo', 'walkthrough'),
  ('Newsletterbot1',             'archive', 'dead >8mo. Superseded by zabalnewsletterbuilder.', 'walkthrough'),
  ('WARZAI',                     'archive', 'dead >8mo', 'walkthrough'),
  ('Firsttimehomebuyers-guide',  'archive', 'dead >8mo. One-off guide.', 'walkthrough'),
  ('ZAIV2',                      'archive', 'dead >8mo. Superseded by current ZAI plan (bot/src/zai).', 'walkthrough'),
  ('SidebySidev2',               'archive', 'dead >8mo', 'walkthrough'),
  ('ZAIV1',                      'archive', 'dead >8mo. Superseded.', 'walkthrough'),
  ('fractalbotV3June2025',       'archive', 'dead >8mo. Old Fractal bot. Live = fractalbotjuly2026.', 'walkthrough'),
  ('ZAO-FRACTAL-BOTV2',          'archive', 'dead >8mo. Old Fractal bot.', 'walkthrough'),
  ('zaochella-cypher-mp4-file',  'archive', 'dead >8mo. Single media file.', 'walkthrough'),
  ('zaloraV1',                   'archive', 'dead >8mo', 'walkthrough'),
  ('newsletter-bot-1',           'archive', 'dead >8mo. Superseded by zabalnewsletterbuilder.', 'walkthrough'),
  ('loanz-platform-1',           'archive', 'dead >8mo', 'walkthrough'),
  ('eliza1',                     'archive', 'dead >8mo. ElizaOS experiment.', 'walkthrough'),
  ('Agent2',                     'archive', 'dead >8mo. Test framework.', 'walkthrough'),
  -- explicit old versions
  ('RESUMEV1',                   'archive', 'old version', 'walkthrough'),
  ('fractalbotfeb2026',          'archive', 'old version (eth boulder). Live = fractalbotjuly2026.', 'walkthrough'),
  ('zaaltimelinev1.1',           'archive', 'old version', 'walkthrough'),
  ('zaaltimelinev1',             'archive', 'old version', 'walkthrough'),
  ('fractalbotv1old',            'archive', 'old version', 'walkthrough'),
  ('fractalbotdec2025',          'archive', 'old version. Live = fractalbotjuly2026.', 'walkthrough'),
  ('fractalbotnov2025',          'archive', 'old version. Live = fractalbotjuly2026.', 'walkthrough'),
  ('fractalbotmarch2026',        'archive', 'old version. Live = fractalbotjuly2026.', 'walkthrough'),
  -- stale duplicates whose successor is live
  ('ZAO-Video-Editor',           'archive', 'stale dup of ZAOVideoEditor (kept, active).', 'walkthrough'),
  ('zabalnewsletter',            'archive', 'stale. Superseded by zabalnewsletterbuilder (live).', 'walkthrough'),
  ('zaomusicbot',                'archive', 'stale', 'walkthrough'),
  ('ZOUNZ',                      'archive', 'stale. Music mini-app experiment, paused.', 'walkthrough'),
  ('bettercallzaal-coding-hub',  'archive', 'stale. Superseded by /repos + zao-mcp.', 'walkthrough'),
  ('B-ZBUILD2',                  'archive', 'stale build experiment', 'walkthrough'),
  ('ZAOFlights',                 'archive', 'stale. Folded into zaotravelz (kept).', 'walkthrough'),
  ('CustomPDFCreator',           'archive', 'stale one-off tool', 'walkthrough'),
  ('zski',                       'archive', 'stale', 'walkthrough'),
  ('ww',                         'archive', 'stale, no description. WaveWarZ lives in wwbase/wwtracker.', 'walkthrough'),
  ('16statestreet',              'archive', 'stale one-off site', 'walkthrough'),
  ('bettercallzaal-strategies',  'archive', 'stale', 'walkthrough'),
  ('ethboulderjournal',          'archive', 'stale event journal', 'walkthrough'),
  ('zabal-bot-archive',          'archive', 'already an archive by name', 'walkthrough'),
  ('zabalbot',                   'archive', 'stale. Brand voices live as ZOE persona blocks now.', 'walkthrough'),
  ('ZAO-Leaderboard',            'archive', 'stale. Respect leaderboard lives in ZAOOS /fractals.', 'walkthrough'),
  ('zabalsocials',               'archive', 'stale', 'walkthrough'),
  ('agencyweb3toolkit',          'archive', 'stale', 'walkthrough'),
  ('zaoprojects',                'archive', 'stale, no description', 'walkthrough'),
  ('unifiedchatclient',          'archive', 'stale', 'walkthrough'),
  ('cedartide',                  'archive', 'stale, no description', 'walkthrough'),
  ('wwinfo1',                    'archive', 'stale. WaveWarZ info lives in wwbase.', 'walkthrough')
on conflict (repo_name) do nothing;
