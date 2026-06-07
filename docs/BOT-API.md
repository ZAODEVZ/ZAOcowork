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

## Per-bot scope (who calls what)

| Bot | Handle | create | patch | heartbeat | status board |
|-----|--------|:------:|:-----:|:---------:|:------------:|
| Hermes | `@zoe_hermes_bot` | — | ✅ (close without a merge) | ✅ | — |
| ZOE / `/meeting` | `@zaoclaw_bot` | ✅ (captured action-items) | — | ✅ | — |
| ZAO Devz | `@zaodevz_bot` | — | — | ✅ | — |
| ZAOstock | `@ZAOstockTeamBot` | — | — | ✅ | — |

(Scope is advisory in v1 — any valid token can call any endpoint; tighten to a
per-bot allowlist later if needed.)

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
