# Cowork Bot API — shared contract (`/api/v1/*`)

Single source of truth for how the ZAO bot fleet talks to the coworking app
(`cowork-zaodevz`, live at `https://www.thezao.xyz`). The cowork repo **owns the
server endpoints**; the ZAOOS repo builds the **client** (`bot/src/lib/cowork.ts`)
against this contract. Keep this file and the ZAOOS mirror in sync.

## Auth — per-bot bearer tokens

Every `/api/v1/*` call (except where noted) requires:

```
Authorization: Bearer <per-bot-token>
```

Tokens are configured server-side in one env var (no tokens table for now):

```
COWORK_BOT_TOKENS="hermes=tok_xxx,zoe=tok_yyy,zaodevz=tok_zzz,zaostock=tok_www"
```

The server reverse-maps the presented token → bot name (constant-time compare),
logs the resolved bot on every write (audit), and rejects unknown tokens with
`401`. **Revoke** a bot by rotating/removing its entry and redeploying. Generate
tokens as long random strings (e.g. `openssl rand -hex 24`).

## Rate limits

Every `/api/v1/*` endpoint is rate-limited **per bot token** (in-memory
sliding window, approximate under serverless scale-out):

| Scope | Limit |
|-------|-------|
| Task writes (`POST`/`PATCH /items`, comments) | 60 / min |
| Reads (`GET /items*`) | 120 / min |
| Heartbeats | 120 / min |

On `429` the body includes `retryAfterMs` / `retryAfterSeconds` — back off and
retry. All responses are `{ ok: true, ... }` or `{ ok: false, error }`.

## Using it from Claude

Two turnkey wrappers ship in this repo so any Claude can drive the board:

- **MCP server** (`mcp-server/`) — native tools (`list_tasks`, `get_task`,
  `create_task`, `update_task`, `comment_task`) for Claude Desktop / Code.
- **Skill** (`skills/zao-cowork/SKILL.md`) — curl-based recipes for Claude Code.

Both need `ZAO_API_URL` + `ZAO_BOT_TOKEN`. See `mcp-server/README.md`.

## Endpoints

### 1. `POST /api/v1/items` — create a task
```jsonc
// body
{
  "title": "string (required)",
  "assignee": "Zaal | Iman | ThyRev | Samantha | Tyler | Shawn | Both | Open",   // optional; default Open (claimable)
  "due_date": "YYYY-MM-DD",        // optional
  "notes": "string",               // optional
  "source": "human-bot | meeting-capture | research-dispatch | ai-proposal | external-api | ..." // optional; default "human-bot"
}
// 201 -> { "ok": true, "id": "812" }   // id is the legacy #N, used everywhere
```
- `assignee` is a display name; the server resolves it to the `team_members`
  UUID. Unknown names fall back to `Open`.
- `source` must be one of `TASK_SOURCES` (`src/lib/types.ts`); invalid → `human-bot`.
- New tasks start in `TODO`.

### 2. `PATCH /api/v1/items/:id` — update a task
`:id` is the legacy `#N` (UUID also accepted).
```jsonc
// body — any subset
{
  "status": "TODO | WIP | BLOCKED | DONE | TRIAGE",  // case-insensitive; in_progress/wip both ok
  "assignee": "Zaal | … | Open",
  "due_date": "YYYY-MM-DD",
  "notes": "string"
}
// 200 -> { "ok": true, "id": "812", "status": "DONE" }
// 404 -> { "ok": false, "error": "no task #812" }
```
- Setting `DONE` stamps `completed_at`/`completed_by=<bot>`. Bots are trusted
  infra, so status applies directly (no review queue).

### 2a. `GET /api/v1/items` — list tasks
Filter via query params; all optional.
```jsonc
// GET /api/v1/items?status=WIP&assignee=thyrev&q=calendar&limit=20
// status   TODO|WIP|BLOCKED|DONE   assignee  login slug (lowercase)
// q        search title/notes      limit     1..500 (default 100)
// 200 -> { "ok": true, "count": 3, "tasks": [
//   { "id": "42", "title": "...", "status": "WIP", "priority": "P2",
//     "assignees": ["thyrev"], "owner": "ThyRev", "category": "...",
//     "due": "2026-07-03", "notes": "...", "createdAt": "...", "updatedAt": "..." } ] }
```
Archived + TRIAGE tasks are excluded.

### 2b. `GET /api/v1/items/:id` — read one task (with comments)
```jsonc
// 200 -> { "ok": true, "task": { …, "comments": [
//   { "author": "thyrev", "content": "...", "createdAt": "..." } ] } }
// 404 -> { "ok": false, "error": "no task #42" }
```

### 2c. `POST /api/v1/items/:id/comments` — comment on a task
```jsonc
// body
{ "content": "string (required, max 4000)" }
// 201 -> { "ok": true, "id": "42", "commentId": "c-..." }
```

### 3. `POST /api/v1/bots/heartbeat` — report alive
The bot identity comes from the **token**, not the body (a token can only
heartbeat as itself).
```jsonc
// body
{ "status": "up | degraded | down", "meta": { "version": "2.8", "...": "..." } }  // all optional; status default "up"
// 200 -> { "ok": true, "bot": "hermes", "status": "up", "ts": "2026-06-07T..." }
// 503 if the bot_heartbeats table isn't provisioned yet (apply migration 010)
```

### 4. `GET /api/v1/bots` — status board
```jsonc
// 200 -> { "ok": true, "bots": [
//   { "bot": "hermes", "status": "up", "ts": "...", "meta": {}, "online": true, "ageSeconds": 42 }
// ]}
```
`online` = status `up` and last heartbeat within 10 min.

### 5. Command queue — `POST /api/v1/bots/commands`, `GET /api/v1/bots/commands`, `POST /api/v1/bots/commands/:id/result`

**Added to this doc 2026-07-13 — implemented since the `bot_commands` table (migration 012) shipped, but never documented here until an audit found the gap.** Checked directly: `bot_commands` has 3 rows, all from 2026-06-07 — `zaostock` pulled and completed a `pause` and a `resume` within seconds of being enqueued, `zoe` did the same for an `ask`. So this has worked end-to-end before, by bots in the ZAOOS repo. It's been dormant since (no rows created after that date as of this check) and nothing in this repo's own code (`agent/`, `research-dispatch/`) calls it.

**Enqueue a command** (board only — session + `isAdmin`, not bot-token):
```jsonc
// POST /api/v1/bots/commands
{ "bot": "hermes", "command": "restart", "args": {} }  // args optional, default {}
// command must be one of: restart, pause, resume, run_task, ask, start, stop
// 200 -> { "ok": true, "id": 42, "bot": "hermes", "command": "restart" }
// 400 if bot missing or command not in the allowed list
// 401/403 if not a logged-in admin
```

**Pull + claim pending commands** (bot-token auth — pulling atomically flips `pending` -> `claimed` so two pollers can't double-execute):
```jsonc
// GET /api/v1/bots/commands?bot=<self>
// A token may only pull its own bot's queue (bot param must equal the caller's
// resolved identity, or be omitted). Only these commands are claimable this way:
// restart, pause, resume, run_task, ask
// 200 -> { "ok": true, "commands": [{ "id": 42, "bot": "hermes", "command": "restart", "args": {}, "status": "claimed", "created_at": "..." }] }

// GET /api/v1/bots/commands?scope=host
// Only the token that resolves to bot name "fleet" may call this - it claims
// host lifecycle ops (start, stop) on behalf of any bot. Any other token gets 403.
```

**Report the outcome** (bot-token auth — a token may only complete its own bot's command, except `fleet` which may complete any):
```jsonc
// POST /api/v1/bots/commands/:id/result
{ "status": "done | error", "result": { "...": "..." } }  // result optional
// 200 -> { "ok": true, "id": 42, "status": "done" }
// 403 if the caller isn't the command's bot (or "fleet")
// 404 if the command id doesn't exist
```

### 6. `POST /api/v1/claim` — redeem a one-time pairing code for a bot token

**Added to this doc 2026-07-13.** Provisions a new bot's token without an env var change or redeploy (pairs with the `bot_tokens` table + `token_claims`, migrations 016/018). Unauthenticated by design (the caller has no token yet) — gated instead by the one-time code itself (single-use, short expiry) and IP rate-limited (10/min) against guessing.
```jsonc
// POST /api/v1/claim
{ "code": "string, max 64 chars" }
// 200 -> { "ok": true, "token": "...", "bot": "...", "skill": "<markdown skill doc for the bot to save>" }
// 404 -> { "ok": false, "error": "invalid or expired code" }
// 429 -> { "ok": false, "error": "rate limited", "retryAfterSeconds": N }
```
Codes are generated server-side (not documented here — this is the redemption half only); ask whoever manages `bot_tokens` for a fresh code if you're onboarding a new bot.

## Per-bot scope (who calls what)

| Bot | Handle | create | patch | heartbeat | status board |
|-----|--------|:------:|:-----:|:---------:|:------------:|
| Hermes | `@zoe_hermes_bot` | — | ✅ (close without a merge) | ✅ | — |
| ZOE / `/meeting` | `@zaoclaw_bot` | ✅ (captured action-items) | — | ✅ | — |
| ZAO Devz | `@zaodevz_bot` | — | — | ✅ | — |
| ZAOstock | `@ZAOstockTeamBot` | — | — | ✅ | — |

(Scope is advisory for items/heartbeat in v1 — any valid token can call any
endpoint there; tighten to a per-bot allowlist later if needed. **The command
queue (section 5) is the exception** — that's already real per-token
enforcement: a bot can only pull/complete its own commands, and only the
token resolving to `"fleet"` can touch host-lifecycle `start`/`stop` ops.)

## Already exists — don't duplicate

- **Hermes-done on PR merge is already automatic.** `POST /api/github/webhook`
  (HMAC `GITHUB_WEBHOOK_SECRET`) marks a task DONE when its PR merges, and
  `POST /api/v1/auto-close` (Bearer `AUTOCLOSE_KEY`) polls for the same. A task
  links to a PR via `cowork#<id>` in the PR title/body, or
  `legacy_id=pr-test-<N>` / `legacy_source=pr-auto:<N>`. Use **`PATCH … {status:"DONE"}`**
  only to close a task **without** a merge.

## Server notes
- Endpoints reuse the tasks data layer (`getActions`/`saveActions`), so writes
  go through the same concurrency-safe diff + owner-name→UUID resolution as the
  web app. Heartbeats use `bot_heartbeats` (migration `010`).
- All `/api/v1/*` are whitelisted in middleware and bearer-authed in-handler.

## Setup checklist (cowork side)
- [ ] Set `COWORK_BOT_TOKENS` on Vercel (one token per bot).
- [ ] Apply `supabase/migrations/010_bot_heartbeats.sql` (Supabase SQL editor).
- [ ] Share each token with the ZAOOS bot (env on the VPS).
