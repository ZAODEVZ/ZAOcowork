# QA checklist & deploy/config audit

Post-deploy smoke tests for the ZAO cowork tracker, plus the env-var/topology
notes from the 2026-06 audit. Run the smoke tests after every deploy that
touches auth, the data layer, server actions, or the bot.

## Deployment topology

| Piece | Runs on | Source | Notes |
|-------|---------|--------|-------|
| Web app (`thezao.xyz`) | Vercel project `za-ocowork` | `main` branch, this repo | env set in Vercel → **redeploy** to pick up env changes |
| Telegram bot (`@ZAOcoworkingBot`) | VPS / ZAO OS (long-poll) | `agent/` (deployed separately) | only *sends* with the bot token; web reuses the same token to send |
| Database | Supabase project `etwvzrmlxeobinrlytza` | `supabase/migrations/*` | ⚠️ see RLS note below |

> ⚠️ **RLS:** the applied migrations (001–006) enable **no** row-level security.
> The `supabase/schema.sql` / `db/schema.sql` policies are aspirational (wrong
> table shape, written for Supabase Auth which this app doesn't use). Confirm in
> the dashboard that RLS is enabled on `tasks`, `team_members`, `audit_logs`,
> `brands`, `task_proposals`, `projects` — or that the anon key is **not**
> exposed anywhere. The app reads/writes with the service key (bypasses RLS), so
> enabling RLS won't break it but will lock out the public anon key.

## Smoke tests (web)

- [ ] **Login** with each role; bad password is rejected; logout works.
- [ ] **Open redirect** (audit #5): visiting `/login?from=https://evil.com` then
      logging in lands on `/`, NOT evil.com. `/login?from=/music` → lands on `/music`.
- [ ] **Digest auth** (audit #2): `GET /api/digest` while logged out → 401 (not the board).
- [ ] **Concurrent edit** (audit #1): two browsers/users; A creates a task while
      B edits another; refresh → no task disappears.
- [ ] **Worker DONE** (audit #3): as `thyrev`/`samantha`/`tyler`, bulk-set-status
      to DONE and Todo→DONE do NOT move the task to DONE (go through review);
      leads still can.
- [ ] **Worker archive** (audit #3): a worker cannot archive (bulk or single);
      a lead/admin can.
- [ ] **New member** (audit #4): add a member in `/admin`; within ~1 min their
      tasks show their name, not "Both".
- [ ] **Owner badges** (audit #10): ThyRev/Samantha/Tyler/Shawn show their own
      colors, not slate "Both".
- [ ] **Comment @mention** → group ping fires in the Telegram group; author is
      excluded; deep link `/todo/<id>` opens the task.
- [ ] **AI chat** streams a full reply (no dropped trailing character) (audit #12).
- [ ] **Delete** a task with a forced server error → panel shows failure rather
      than closing silently (audit #11).

## Smoke tests (bot)

- [ ] `/mine`, `/list` render; triaged items don't sort randomly (audit A5).
- [ ] Morning/EOD/stale digests fire once per day (no double-send after a
      restart) (audit A4).
- [ ] `/ping <name>` DMs the right person (telegram_id resolves) (audit A1).
- [ ] Adding a member via `/adduser` → their `/add` items attribute correctly
      within ~1 min (audit A2).

## Env-var audit

`.env.example` has drifted from what the code actually reads.

**Missing from `.env.example` (web reads them):** `DIGEST_CRON_TOKEN`,
`DIGEST_FROM_ADDRESS`, `DIGEST_RECIPIENTS`, `NEXT_PUBLIC_APP_URL`,
`RESEND_API_KEY`.

**Listed but unused:** `HERMES_API_KEY` (no code reference).

**Web (Vercel) required:** `AUTH_SECRET` (32+ chars), `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, `ZAAL/IMAN/THYREV/SAMANTHA/TYLER_PASSWORD`,
`TELEGRAM_BOT_TOKEN` + `TELEGRAM_GROUP_CHAT_ID` (comment pings),
`APP_BASE_URL`/`NEXT_PUBLIC_APP_URL` (deep links), `GITHUB_WEBHOOK_SECRET`
(if webhook used), `MINIMAX_API_KEY` (chat), `RESEND_API_KEY` +
`DIGEST_CRON_TOKEN` + `DIGEST_RECIPIENTS` (if email digest used).

**Bot (VPS) required:** `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL` +
`SUPABASE_SERVICE_KEY`, `GITHUB_TOKEN` + `GITHUB_REPO` + `GITHUB_BRANCH`
(roster), one LLM key (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`MINIMAX_API_KEY`),
`DEFAULT_LLM_PROVIDER` (validated at load — audit A9). Admin gating uses BOTH
`ADMIN_USER_IDS` (env) and the `team.json` `admin` flag — these can diverge
(audit A8); pick one source of truth.

## Local verification

```bash
npm run build      # web: TypeScript + Next compile
npm test           # web: unit tests (parsers, date utils)
npm --prefix agent run typecheck   # bot: tsc --noEmit
```
