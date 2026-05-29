-- INSERT-ONLY import of the new cowork cards into the live tasks table.
-- Safe: only INSERTs. Never updates or deletes. legacy_id is assigned fresh
-- (current max numeric legacy_id + row number) so it can never collide.
-- Paste this whole thing into the Supabase SQL editor and Run.

WITH base AS (
  SELECT COALESCE(MAX(legacy_id::int), 0) AS m
  FROM tasks
  WHERE legacy_id ~ '^[0-9]+$'
),
v(rn, project, title, status, owner_key, created_by_key, category, priority, phase, important, urgent, due, notes, created_at, metadata, service_class, source) AS (
  VALUES
  (1, 'zaodevz', 'Decide neko stream destination + OBS/Meld host (blocks deploy)', 'todo', 'zaal', 'zaal', 'Infrastructure', 'P1', 'Define', true, true, '2026-06-07', 'Two open decisions blocking the neko deploy (task 20):
1) RTMP DESTINATION - OBS/Meld is the encoder/compositor, NOT a destination. Pick where it pushes: YouTube Live / Twitch / Restream (multi-platform).
2) OBS/Meld HOST - Mac = fine for the Jun 2 kickoff DEMO but the stream dies when the Mac sleeps (not true 24/7). VPS = real 24/7 encode but heavier.
LOCKED: D2=B (RTMP creds in the docker-compose env block on the VPS, chmod 600). D3=A (host neko on 31.97.148.88).
NOTE: 31.97.148.88 also runs Hermes - watch CPU/RAM after deploy; fall back to VPS2 (Iman, 187.77.3.104) if co-tenancy gets tight.

[2026-05-29] Rescheduled later per Zaal - de-collide from the zabalgames Jun 1 launch (proposed).', '2026-05-29T10:38:00.000Z', '{"due": "2026-06-07", "taskType": "task", "activity": [{"id": "a-leeward-19", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T10:38:00.000Z"}]}', 'FixedDate', 'human-web'),
  (2, 'zaodevz', 'Deploy neko 24/7 music stream on 31.97.148.88 (Leeward kickoff)', 'blocked', 'zaal', 'zaal', 'Infrastructure', 'P1', 'Improve', true, true, '2026-06-09', 'Runbook (run on 31.97.148.88 once task 19 is decided):
STEP 1 - Verify SSH: ssh root@31.97.148.88 ''hostname && docker --version && uname -a''. If publickey denied: ssh-copy-id, or fall back to VPS2 (Iman).
STEP 2 - Verify UDP 52000-52100 inbound (iptables/ufw + 2-terminal nc -u test). If blocked: open at Hostinger control panel first, then iptables -I INPUT -p udp --dport 52000:52100 -j ACCEPT + netfilter-persistent save.
STEP 3 - mkdir /opt/neko; write docker-compose.yml (image ghcr.io/m1k1o/neko/chromium:latest, NAT1TO1=31.97.148.88, EPR 52000-52100, h264 2500k, opus). REPLACE both CHANGE_ME_* passwords. Leave NEKO_CAPTURE_BROADCAST_URL BLANK (OBS/Meld broadcasts, not neko). chmod 600 + docker compose up -d.
STEP 4 - open http://31.97.148.88:8080, log in admin, open YT Music/Bandcamp in the neko browser, verify audio.
STEP 5 (optional/deferrable) - Cloudflare tunnel route neko.zaoos.com -> localhost:8080 in /etc/cloudflared/config.yml + DNS CNAME.
Full compose block is in the Leeward kickoff packet (2026-05-29).

[2026-05-29] Rescheduled later per Zaal - de-collide from the zabalgames Jun 1 launch (proposed).', '2026-05-29T10:40:00.000Z', '{"due": "2026-06-09", "taskType": "task", "comments": [{"id": "c-block-20", "userId": "zaal", "displayName": "Zaal", "content": "BLOCKED on task 19: stream destination (YT/Twitch/Restream) + OBS/Meld host (Mac vs VPS) not yet decided.", "createdAt": "2026-05-29T10:40:00.000Z"}], "activity": [{"id": "a-leeward-20", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T10:40:00.000Z"}, {"id": "a-cmt-20", "userId": "zaal", "displayName": "Zaal", "action": "commented", "detail": "BLOCKED on task 19: stream destination (YT/Twitch/Restream) + OBS/Meld host (Mac vs VPS) not yet decided.", "createdAt": "2026-05-29T10:40:00.000Z"}]}', 'FixedDate', 'human-web'),
  (3, 'zaodevz', 'DM Leeward morning of Jun 2 - kick off composite-stream build', 'todo', 'zaal', 'zaal', 'Other', 'P1', 'Define', true, true, '2026-06-09', 'Per L4. Once neko is live, DM Leeward: ''Hey, neko is live at neko.zaoos.com [or 31.97.148.88:8080], ready when you are - want to pair on the Pion bridge?''
Already tracked in Supabase as meeting-leeward-followup-d; mirrored here because it''s the kickoff trigger.

[2026-05-29] Rescheduled later per Zaal - de-collide from the zabalgames Jun 1 launch (proposed).', '2026-05-29T10:42:00.000Z', '{"due": "2026-06-09", "taskType": "task", "activity": [{"id": "a-leeward-21", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T10:42:00.000Z"}]}', 'FixedDate', 'human-web'),
  (4, 'zaodevz', 'Ship ZOE Gap 1 - decompose.ts router', 'todo', 'zaal', 'zaal', 'ZAO Devz', 'P1', 'Define', true, false, '2026-06-02', 'Sprint Week 2 (starts 2026-06-02) per locked Q10 sprint order. Fork a fresh terminal off main. Branch: ws/zoe-gap-1-decompose.
File: bot/src/zoe/decompose.ts - reads Zaal''s goal, identifies subtask shapes (code/research/comms/data/multi-step), returns a routing plan ZOE then dispatches.
Pattern from bot/src/zoe/.claude/agents/task-dispatcher.md. Builds on Gap 2 (PR #712).', '2026-05-29T10:44:00.000Z', '{"due": "2026-06-02", "taskType": "task", "activity": [{"id": "a-leeward-22", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T10:44:00.000Z"}]}', 'FixedDate', 'human-web'),
  (5, 'zaodevz', 'Post-merge: migrate live ZOE to GATEWAY persona (PR #712)', 'todo', 'zaal', 'zaal', 'Infrastructure', 'P2', 'Define', false, false, null, 'After PR #712 (ZOE Gap 2) merges: on the Iman VPS (VPS2, 187.77.3.104) manually rm ~/.zao/zoe/persona.md + restart ZOE so the live agent picks up the new GATEWAY routing pattern (8-worker description + anti-fabrication binding). No action until merge.', '2026-05-29T10:46:00.000Z', '{"taskType": "task", "activity": [{"id": "a-leeward-23", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T10:46:00.000Z"}]}', 'Standard', 'human-web'),
  (6, 'zaodevz', 'Read cowork-fork doc 765 (coordination layers) before any cowork UX change', 'todo', 'zaal', 'zaal', 'Site / Tech', 'P2', 'Define', false, false, '2026-06-04', 'Branch ws/research-coordination-layers, commit 9dd791a6 has doc 765. The Areas/Projects/Tasks coordination-layer decision likely cascades into Phase I of this tracker (Project type + projectId already partly in types.ts). Read before touching cowork UX.

[2026-05-29] Proposed due (confirm/adjust).', '2026-05-29T10:48:00.000Z', '{"due": "2026-06-04", "taskType": "task", "activity": [{"id": "a-leeward-24", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T10:48:00.000Z"}]}', 'Standard', 'human-web'),
  (7, 'zaodevz', 'Confirm ZABAL mentor-handbook specifics before any draft ships', 'blocked', 'zaal', 'zaal', 'Other', 'P2', 'Define', true, false, null, 'Per feedback_no_sub_agent_context_fabrication (the 758e incident): NO mentor handbook draft ships until Zaal confirms the actual specifics - USDC amount + ETH pool + hr/week + cadences + kickoff date + NDA decision + escalation contact. ZABAL-fork owns the handbook (Q15). PR #708 already merged the fabrication fix to main.', '2026-05-29T10:50:00.000Z', '{"taskType": "task", "comments": [{"id": "c-block-25", "userId": "zaal", "displayName": "Zaal", "content": "BLOCKED: comp specifics (USDC / ETH pool / hrs / cadence / dates / NDA / escalation) not yet Zaal-confirmed. Anti-fabrication rule gates the draft.", "createdAt": "2026-05-29T10:50:00.000Z"}], "activity": [{"id": "a-leeward-25", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T10:50:00.000Z"}, {"id": "a-cmt-25", "userId": "zaal", "displayName": "Zaal", "action": "commented", "detail": "BLOCKED: comp specifics (USDC / ETH pool / hrs / cadence / dates / NDA / escalation) not yet Zaal-confirmed. Anti-fabrication rule gates the draft.", "createdAt": "2026-05-29T10:50:00.000Z"}]}', 'Standard', 'human-web'),
  (8, 'zaodevz', 'Bootstrap the 100-list - agent best-practices (first 10 items)', 'todo', 'zaal', 'zaal', 'ZAO Devz', 'P2', 'Define', false, false, '2026-06-15', 'Per Q11=NOW. Create research/agents/100-ai-agent-best-practices/ folder + _meta.yaml + first 10 items. Structure spec in doc 759 v2 deltas Part B. Author in Week 3 while the gap-3 critics design is fresh.

[2026-05-29] Proposed due (confirm/adjust).', '2026-05-29T10:52:00.000Z', '{"due": "2026-06-15", "taskType": "task", "activity": [{"id": "a-leeward-26", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T10:52:00.000Z"}]}', 'Standard', 'human-web'),
  (9, 'zaodevz', 'Discord 24/7 radio bot - deferred (Week 2-3, post-kickoff)', 'todo', 'zaal', 'zaal', 'Other', 'P3', 'Define', false, false, null, 'Per doc 758d this is Week 2-3 work, NOT a Jun 2 dependency. Skip until the Leeward kickoff defines whether Discord is in the composite-stream scope or a separate workstream.', '2026-05-29T10:54:00.000Z', '{"taskType": "task", "activity": [{"id": "a-leeward-27", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T10:54:00.000Z"}]}', 'Standard', 'human-web'),
  (10, 'zaodevz', 'ZAOscribe: deploy bot to VPS + first live test', 'todo', null, 'zaal', 'Infrastructure', 'P1', 'Define', true, false, '2026-06-03', 'EPIC - github.com/ZAODEVZ/ZAOsribeBOT. Path to first live /scribe call.
[ ] 1 Create Discord Developer Portal app + bot user
[ ] 2 Capture App ID, Bot Token, Guild ID, Zaal User ID, Iman User ID
[ ] 3 Enable Server Members Intent in dev portal
[ ] 4 Decide tunnel: cloudflared vs tailscale, get webhook URL
[ ] 5 (Iman) create zaoscribe user + /opt/zaoscribe + /var/lib/zaoscribe on VPS
[ ] 6 (Iman) git clone + npm ci --omit=dev on VPS
[ ] 7 Fill VPS .env with prod secrets + chmod 600
[ ] 8 npm run register-commands on VPS (one-time per guild)
[ ] 9 Install systemd unit + enable --now zaoscribe
[ ] 10 Install bot in ZAO server via OAuth URL
[ ] 11 Two-person /scribe start -> /scribe stop smoke test
[ ] 12 /vps status service:zaocoworking-bot.service smoke test
[2026-05-29] Proposed due (confirm).', '2026-05-29T12:01:00.000Z', '{"due": "2026-06-03", "taskType": "task", "activity": [{"id": "a-batch2-28", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:01:00.000Z"}]}', 'FixedDate', 'meeting-capture'),
  (11, 'zaodevz', 'ZAOscribe receiver: tunnel + first live POST->SCP test', 'todo', 'zaal', 'zaal', 'Infrastructure', 'P1', 'Define', true, false, '2026-06-03', 'EPIC - mac-local at ~/Documents/ZAODEVZ/zaoscribe-receiver/. Pairs with the VPS bot.
[ ] 21 Decide if receiver gets its own GitHub repo (currently local-only)
[ ] 22 Fill local .env (secret must match VPS bot)
[ ] 23 Run cloudflared/tailscale tunnel to expose port 8731
[ ] 24 First live test: VPS bot POSTs -> receiver verifies + SCPs mix.wav
[ ] 25 Wire /meeting skill to auto-detect ready.txt sentinel in queue folder
[ ] 26 Decide auto-run vs manual /meeting after receiver lands a queue entry
[ ] 27 (Optional) Telegram ping when a recording lands
[2026-05-29] Proposed due (confirm).', '2026-05-29T12:02:00.000Z', '{"due": "2026-06-03", "taskType": "task", "activity": [{"id": "a-batch2-29", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:02:00.000Z"}]}', 'FixedDate', 'meeting-capture'),
  (12, 'zaodevz', 'Doc 753: re-apply v2 corrections + fire to Bonfire/tracker', 'todo', 'zaal', 'zaal', 'Other', 'P2', 'Define', true, false, '2026-06-01', 'EPIC - Craig 1Jctx re-extraction, ZAOOS research/events/. Concurrent linter reverted v2.
[ ] 28 Re-apply v2 corrections to research/events/753-.../README.md
[ ] 29 Re-apply zee3 attribution in attendees row
[ ] 30 Re-apply Liquid -> liquidnfts.finance correction
[ ] 31 Re-apply ZAOscribe bot identification
[ ] 32 Re-bump meetings-index actions count 3 -> 11
[ ] 33 Restore doc 760 ZAOville row in meetings-index
[ ] 34 Fire Bonfire amendment episodes (8 actions + 6 decisions)
[ ] 35 Insert 11 action rows into Supabase cowork tasks table
[ ] 36 Generate Telegram copy-paste block (optional)
[ ] 37 Generate clipboard next-actions page (owner-grouped)
[ ] 38 Commit doc 753 v2 + index + memory on ws/research-coordination-layers
[2026-05-29] Proposed due (confirm).', '2026-05-29T12:03:00.000Z', '{"due": "2026-06-01", "taskType": "task", "activity": [{"id": "a-batch2-30", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:03:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (13, 'zaodevz', 'ZAO-OS housekeeping: commit untracked dirs + trim MEMORY.md', 'todo', 'zaal', 'zaal', 'Other', 'P3', 'Define', false, false, null, 'EPIC - uncommitted from session start.
[ ] 39 Review + commit research/events/760-zaoville-dcoop-candy-prod-may26/ (untracked)
[ ] 40 Review + commit research/events/session-2026-05-27-...-zoe-gap-2-shipped/ (untracked)
[ ] 41 Trim MEMORY.md - exceeded 24.4 KB index limit at session start', '2026-05-29T12:04:00.000Z', '{"taskType": "task", "activity": [{"id": "a-batch2-31", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:04:00.000Z"}]}', 'Intangible', 'meeting-capture'),
  (14, 'zaodevz', 'Research dispatches: agent-builder concept + Liquid x COC partnership', 'todo', 'zaal', 'zaal', 'ZAO Devz', 'P3', 'Define', false, false, null, 'EPIC - follow-ups Zaal flagged in-call.
[ ] 42 /zao-research on agent-builder agent concept (sequence: AFTER ZAOscribe ships)
[ ] 43 /zao-research on Liquid x COC Concertz partnership (liquidnfts.finance)', '2026-05-29T12:05:00.000Z', '{"taskType": "task", "activity": [{"id": "a-batch2-32", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:05:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (15, 'zaodevz', 'zabalgames: answer 7 fact-audit Qs (unblocks video recording)', 'todo', 'zaal', 'zaal', 'Other', 'P1', 'Define', true, true, '2026-05-31', 'EPIC - blocks video recording. ~1 min to answer all 7:
9. ZAO Music team - still ''DCoop, GodCloud, Iman''?
10. ZAOstock sponsors - ''Wallace Events (tents/AV), Limone'' both confirmed?
11. ZAO Music first release - ''Cipher = #1'' multi-artist cypher still active?
12. COC Concertz #6 venue - ''Stilo World Spatial'' locked?
13. NextZAOville - ''DMV July 2026'' locked or aspirational?
14. $ZABAL multipliers - ''staking 2.1-3.0x, empire 4.0-8.6x'' current?
15. ''7 active leaderboard slots'' in $ZABAL Empire - current count?', '2026-05-29T12:06:00.000Z', '{"due": "2026-05-31", "taskType": "task", "activity": [{"id": "a-batch2-33", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:06:00.000Z"}]}', 'FixedDate', 'meeting-capture'),
  (16, 'zaodevz', 'zabalgames + Magnetiq: Tyler + Thy Rev coordination DMs', 'todo', 'zaal', 'zaal', 'Other', 'P1', 'Define', true, false, '2026-05-31', 'EPIC - ~10 min of DMs that unblock content + scheduling.
[ ] Send Tyler the Magnetiq mementos DM (clipboard clip-*-tyler-magnetiq-handoff-dm.html)
[ ] Tyler reply: brand-education content path A/B/C from docs/tyler-notion-brief-2026-05-28.md
[ ] DM Tyler for his workshop date in June
[ ] DM Thy Rev for session 1 date + topic
[ ] DM Tyler for his FID (HAATZ avatar wiring)
[ ] DM Thy Rev for her FID', '2026-05-29T12:07:00.000Z', '{"due": "2026-05-31", "taskType": "task", "activity": [{"id": "a-batch2-34", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:07:00.000Z"}]}', 'FixedDate', 'meeting-capture'),
  (17, 'zaodevz', 'Magnetiq: record + edit + ship 8 ZAO brand videos', 'todo', 'zaal', 'zaal', 'Content', 'P1', 'Define', true, false, '2026-06-01', 'EPIC - ~10 min record + ~30 min Descript.
[ ] Record 8 ZAO brand videos (scripts in docs/magnetiq-mementos-zao-brands-2026-05-28.md)
[ ] Light Descript edit (remove uh/um/repeats)
[ ] Upload to Magnetiq alongside Tyler''s memento pages
[ ] Send Tyler the video files
NOTE: blocked on the 7 fact-audit Qs landing first.', '2026-05-29T12:08:00.000Z', '{"due": "2026-06-01", "taskType": "task", "activity": [{"id": "a-batch2-35", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:08:00.000Z"}]}', 'FixedDate', 'meeting-capture'),
  (18, 'zaodevz', 'zabalgames: ship OG card PNG (W11 - last launch blocker)', 'todo', 'zaal', 'zaal', 'Site / Tech', 'P1', 'Define', true, true, '2026-05-31', 'EPIC - production currently 404s on /assets/og-card.png. 5 min:
[ ] Open assets/og-card.svg in browser
[ ] Screenshot at 1200x630
[ ] Save as assets/og-card.png
[ ] Push to repo', '2026-05-29T12:09:00.000Z', '{"due": "2026-05-31", "taskType": "task", "activity": [{"id": "a-batch2-36", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:09:00.000Z"}]}', 'FixedDate', 'meeting-capture'),
  (19, 'zaodevz', 'zabalgames: 5 ElizaOS bot decisions (Doc 770)', 'todo', 'zaal', 'zaal', 'Infrastructure', 'P1', 'Define', true, false, '2026-06-01', 'EPIC - 5 min to decide; gates the Jun 1-3 bot account setup.
- Bot Farcaster handle: @zabalbot / @zg-bot / @gameschan / your call
- VPS choice: Hetzner CX22 (recommended) / DigitalOcean / Railway
- Bot signup path: A Hypersnap (free, sovereign) / B Neynar (paid, fast)
- Anthropic API key: zaalp99 account / new bot@thezao.com
- Announcement cast: you cast / bot''s own first cast', '2026-05-29T12:10:00.000Z', '{"due": "2026-06-01", "taskType": "task", "activity": [{"id": "a-batch2-37", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:10:00.000Z"}]}', 'FixedDate', 'meeting-capture'),
  (20, 'zaodevz', 'zabalgames: HAATZ docs URL final lookup', 'todo', 'zaal', 'zaal', 'Other', 'P3', 'Define', false, false, null, 'If Cassie has a public docs URL beyond haatz.quilibrium.com, drop the link. 2 min.', '2026-05-29T12:11:00.000Z', '{"taskType": "task", "activity": [{"id": "a-batch2-38", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:11:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (21, 'zaodevz', 'zabalgames READY: logo WebP, FIDs, UI polish, pre-commit linter, sponsor outreach', 'todo', 'zaal', 'zaal', 'Site / Tech', 'P2', 'Define', false, false, '2026-06-01', 'EPIC - no blocker, just go-ahead. Pre-launch hardening.
[ ] H Logo WebP variants (10 min) - drops 1.17MB to ~130KB on mobile (R5.1)
[ ] I FIDs for 5 unverified people in roster (5 min) (R1.3)
[ ] J Tier 1 UI polish on /info /p /finals /projects (1 hr)
[ ] K Pre-commit linter for em-dash + emoji + glossary (30 min)
[ ] Run sponsor outreach to 5 targets (R6.3)', '2026-05-29T12:12:00.000Z', '{"due": "2026-06-01", "taskType": "task", "activity": [{"id": "a-batch2-39", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:12:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (22, 'zaodevz', 'zabalgames POST-LAUNCH: N5-N13 site enhancements', 'todo', 'zaal', 'zaal', 'Site / Tech', 'P3', 'Define', false, false, null, 'EPIC - from TODO.md NEXT, after Jun 1 launch.
[ ] N5 Hero banner using SVG OG card (15 min)
[ ] N9 Daily-stats Snap (Doc 654 Empire stats, 30 min) - zlank
[ ] N10 Live Bonfire push + integration test (5 min) - needs BONFIRE_API_KEY
[ ] N11 Update llms.txt with kEngram pointers as rounds land (10 min/round)
[ ] N12 Per-mentor pages populate as roster locks (5 min/mentor)
[ ] N13 Builder OAuth flow Doc 750 (mid-June, 3-4 weeks)', '2026-05-29T12:13:00.000Z', '{"taskType": "task", "activity": [{"id": "a-batch2-40", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:13:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (23, 'zaodevz', 'zabalgames: Notion CMS migration (Doc 760)', 'blocked', 'zaal', 'zaal', 'Infrastructure', 'P3', 'Define', false, false, null, 'EPIC - post-launch.
[ ] Phase 1 Set up 4 Notion DBs + sync script (1-2 days dev)
[ ] Phase 2 Announcements + FAQ DBs migrate (1 day)
[ ] Phase 3 Notion MCP for Claude Code direct write (30 min)', '2026-05-29T12:14:00.000Z', '{"taskType": "task", "comments": [{"id": "c-blk-41", "userId": "zaal", "displayName": "Zaal", "content": "BLOCKED on Tyler confirming scope.", "createdAt": "2026-05-29T12:14:00.000Z"}], "activity": [{"id": "a-batch2-41", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:14:00.000Z"}, {"id": "a-blk-41", "userId": "zaal", "displayName": "Zaal", "action": "commented", "detail": "BLOCKED on Tyler confirming scope.", "createdAt": "2026-05-29T12:14:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (24, 'zaodevz', 'ElizaOS bot Phase 1 build (Doc 770, Jun 1-15)', 'todo', null, 'zaal', 'Infrastructure', 'P2', 'Define', false, false, '2026-06-15', 'EPIC - zabalgames + Hetzner. Timeline:
Jun 1-3  (you) Bot Farcaster account + signer (Path A or B)
Jun 4-5  (dev) Stand up ElizaOS, wire HAATZ + Anthropic
Jun 6-8  (dev) Knowledge base loader + character file
Jun 9    (dev) Deploy to VPS
Jun 10   (you+dev) First 10 test mentions
Jun 11   (you) Cast announcement
Jun 12-15 (both) Iterate from real interactions
Depends on the 5 ElizaOS decisions card.', '2026-05-29T12:15:00.000Z', '{"due": "2026-06-15", "taskType": "task", "activity": [{"id": "a-batch2-42", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:15:00.000Z"}]}', 'FixedDate', 'meeting-capture'),
  (25, 'zaodevz', 'zabalgames risk-register: bot-launch + Phase 2 + ongoing hardening', 'todo', 'zaal', 'zaal', 'Security', 'P2', 'Define', false, false, null, 'EPIC - docs/risk-register-2026-05-28.md.
Pre-bot launch (June): [ ] Confirm Hypersnap signup w/ Cassie (R2.4) [ ] Anthropic budget caps (R2.3) [ ] HAATZ+Neynar 2-tier failover (R6.9) [ ] per-FID rate limiting (R2.2) [ ] Sentry + Better Uptime (R2.7)
Phase 2 (July): [ ] Privy key quorum for tip wallet (R2.4) [ ] Notion webhook + sync (R3.1/3.2/3.4) [ ] Doc 750 Builder OAuth (R6.4)
Ongoing: [ ] Weekly glossary check (R6.8) [ ] Quarterly token rotation (R3.3) [ ] Monthly Farcaster protocol watch (R6.10)', '2026-05-29T12:16:00.000Z', '{"taskType": "task", "activity": [{"id": "a-batch2-43", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:16:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (26, 'zaodevz', 'COC Rev recap: YELLOW caption approval + render PILL/BAR overlays', 'blocked', 'zaal', 'zaal', 'Content', 'P2', 'Define', false, false, null, 'EPIC - in flight this session.
[ ] Approve YELLOW caption preview (frame already sent)
[ ] IF approved: batch render PILL + BAR caption overlays
[ ] Stage all 3 caption .mov to ~/Desktop/COC-Rev-Recap-2026-05-28/overlays-transparent/captions/', '2026-05-29T12:17:00.000Z', '{"taskType": "task", "comments": [{"id": "c-blk-44", "userId": "zaal", "displayName": "Zaal", "content": "BLOCKED on Zaal approving the YELLOW caption preview.", "createdAt": "2026-05-29T12:17:00.000Z"}], "activity": [{"id": "a-batch2-44", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:17:00.000Z"}, {"id": "a-blk-44", "userId": "zaal", "displayName": "Zaal", "action": "commented", "detail": "BLOCKED on Zaal approving the YELLOW caption preview.", "createdAt": "2026-05-29T12:17:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (27, 'zaodevz', 'ZAO brand palette: confirm color 1', 'todo', 'zaal', 'zaal', 'Brand', 'P3', 'Define', false, false, null, 'You supplied #2 blue + #3 yellow - color 1 TBC. Saved as project_zao_brand_palette.md.', '2026-05-29T12:18:00.000Z', '{"taskType": "task", "activity": [{"id": "a-batch2-45", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:18:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (28, 'zaodevz', 'COC Concertz #6 announce sequence (Iman + Zambia squad)', 'todo', 'iman', 'zaal', 'Release', 'P2', 'Define', false, false, null, 'EPIC - imminent this week, Iman + Zambia squad leading; coordinated with Mickey aka Thy Revolution (livestream lead).
[ ] COC #6 announce graphics + copy
[ ] Pair Rev recap (shipped this session) with the announce drop as bridge content', '2026-05-29T12:19:00.000Z', '{"taskType": "task", "activity": [{"id": "a-batch2-46", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:19:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (29, 'zaodevz', 'ZAOstock: DCoop July test run + Fellenz logistics', 'todo', null, 'zaal', 'Artist Onboarding', 'P3', 'Define', false, false, null, 'EPIC.
[ ] DCoop July test run - apply ZAOstock musician onboarding flow to DCoop July 2026 event as repeatability test before Oct (research/events/760-zaoville-dcoop-candy-prod-may26/)
[ ] Fellenz logistics - Portland flight + 2.5hr drive to Ellsworth; NFT drop / Giveth give-backs for travel funding; primed for ZAO Festivals SF 2027', '2026-05-29T12:20:00.000Z', '{"taskType": "task", "activity": [{"id": "a-batch2-47", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:20:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (30, 'zaodevz', 'ZAOstock entry pages: 7 future-expansion pages', 'todo', 'zaal', 'zaal', 'Site / Tech', 'P3', 'Define', false, false, null, 'EPIC - per project_zaostock_entry_pages (21 days old). Extends /team/m/[slug] pattern.
[ ] /musicians/[slug] per-artist profile
[ ] /artists/[slug] per-visual-contributor profile
[ ] /partners/[slug] per-partner-org (Shawn Web3Metal = first)
[ ] /lineup (first nav item, missing)
[ ] /about (consolidate lineage+community+team+mission)
[ ] /partners/apply (PartnerIntakePage) self-serve form
[ ] PartnerDashboardPage + CheckInPage (Oct 3 QR) + PublicReportPage + DisplayPage (venue screen)', '2026-05-29T12:21:00.000Z', '{"taskType": "task", "activity": [{"id": "a-batch2-48", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:21:00.000Z"}]}', 'Standard', 'meeting-capture'),
  (31, 'zaodevz', 'Paperclip-agents pilot: auto-resolve unblocked ZAOOS EB issues (gated)', 'todo', 'zaal', 'zaal', 'ZAO Devz', 'P2', 'Define', true, false, null, 'WHAT ''paperclip agents'' ARE (resolved via /deep-research 2026-05-29):
Paperclip (paperclipai/paperclip, paperclip.ing, MIT) is an open-source AI-AGENT ORCHESTRATION layer - ''manage agents at work'' (org charts, budgets, audit trail). It coordinates agents from Claude Code, Codex, Cursor, OpenCode, or any HTTP bot. So ''paperclip agents'' = coding agents run/managed THROUGH Paperclip. NOTE: Paperclip orchestrates; the actual issue->PR work is done by the underlying agent (Copilot coding agent / claude-code-action / Sweep / OpenHands). (Star count uncertain - sources said 38k vs 68k; treat as low-confidence.)

FIT FOR ZAOOS: repo is TS/Next.js 16 + Supabase + Farcaster/Neynar, public MIT, already has agents/, bot/, mcp/ dirs - agent-friendly and matches ZAO''s ''agents as workers'' model (ZOE/Hermes/claimable Todo flow).

ISSUE TRIAGE (12 open EB):
- GOOD agent candidates (scoped frontend/feature): #419 boosters dashboard, #420 My Empires page, #424 stake forecast widget, #421 leaderboard embeds, #431 slot dashboard, #432 voting miniapp.
- NOT agent candidates (Phase-3 BLOCKED on external/partner write-API): #425 EB-7, #426 EB-8, #427 EB-9 - no agent can unblock these.
- Onchain-touching (#423 auto-cast, #426 BANKER distribute): agent may scaffold, but keep onchain writes read/suggest-only + human approval gate.

RECOMMENDED PLAN (gated pilot, NOT point-at-whole-backlog):
[ ] Pick the executor: GitHub Copilot coding agent (assign issue to @copilot, zero infra) OR claude-code-action (MIT, self-hosted, fits existing Claude usage). Use Paperclip as the orchestration/visibility layer only once running several agents at once.
[ ] Pilot on 2-3 UNBLOCKED scoped issues first (#419, #420, #424).
[ ] Guardrails (mandatory): distinct bot identity + scoped perms; agent pushes to agent/* branches only; DRAFT PRs + mandatory human review (reuse lead-approval workflow); CI/SAST + secret-scan gate before review; cost/iteration caps; label agent PRs; NEVER auto-merge.
[ ] Security: issue/PR/comment text is UNTRUSTED - confirmed prompt-injection (''Comment and Control'') CVEs against Copilot/Claude/Gemini agents in 2025-26. No onchain $ZABAL write without human gate.

Full cited report in chat 2026-05-29.', '2026-05-29T12:40:00.000Z', '{"taskType": "task", "activity": [{"id": "a-pc-1", "userId": "zaal", "displayName": "Zaal", "action": "created", "createdAt": "2026-05-29T12:40:00.000Z"}]}', 'Standard', 'human-web')
)
INSERT INTO tasks
  (legacy_source, legacy_id, kind, project, title, status, owner_id, created_by,
   category, priority, phase, important, urgent, due, notes, completed_at,
   created_at, updated_at, metadata, brands, service_class, archived_at, project_id, source)
SELECT
  'cowork-actions.json',
  ((SELECT m FROM base) + v.rn)::text,
  'task',
  v.project,
  v.title,
  v.status,
  (SELECT id FROM team_members tm WHERE lower(tm.legacy_owner) = v.owner_key),
  (SELECT id FROM team_members tm WHERE lower(tm.legacy_owner) = v.created_by_key),
  v.category,
  v.priority,
  v.phase,
  v.important,
  v.urgent,
  v.due::date,
  v.notes,
  null,
  v.created_at::timestamptz,
  now(),
  v.metadata::jsonb,
  '{}'::text[],
  v.service_class,
  null,
  null,
  v.source
FROM v
RETURNING legacy_id, title;
