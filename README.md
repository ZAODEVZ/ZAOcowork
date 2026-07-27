# ZAOcowork

The ZAO operational tracker. Tasks for **Zaal, Iman, ThyRev, Samantha, Tyler** in one Kanban board, live at **[thezao.xyz](https://www.thezao.xyz)**, edit-in-browser, persistent in Supabase, with a Telegram bot writing to the same table and an autonomous research-dispatch pipeline writing alongside it.

> **Repo:** [github.com/ZAODEVZ/ZAOcowork](https://github.com/ZAODEVZ/ZAOcowork). Deploy = Vercel. Auth = Farcaster/wallet sign-in with admin approval (or legacy per-user password env var) + HMAC-signed cookie. See [Users](#users).

---

## What this is

One canonical place where every input we capture - Telegram bot DMs, research-doc shipments, /meeting recaps, PR test plans, /inbox action-items - lands as a row in the same `tasks` table. Each row carries an owner, priority, status, due date, brand tags, and a `legacy_source` so we can trace where it came from.

Rebuilt out of `bettercallzaal/imanprojects` (the Phase-1 GitHub-Contents-API tracker) onto Supabase so the bot + the web + every Claude session can write by UUID without merge conflicts.

## Stack

- **Web:** Next.js 15 (App Router) + React 19 + Tailwind v3, deployed on Vercel
- **DB:** Supabase Postgres, project `etwvzrmlxeobinrlytza` (cowork-tracker)
- **Auth:** Farcaster/wallet sign-in gated by `team_members.approval_status`, plus legacy per-user password env vars. Both issue the same HMAC-signed httpOnly cookie (`src/lib/auth.ts`), verified at the edge in `src/middleware.ts`. No NextAuth, no DB session. See [Users](#users).
- **Bot:** `agent/` - Node + TypeScript Telegram bot that writes to the same `tasks` table. Supports NL add with due/priority/notes/category in one op + `/ping <name>` for teammate DMs + ping-on-assign from the web.
- **Research dispatch:** `research-dispatch/` - autonomous research pipeline (cron-driven, has its own README + CLAUDE.md). Writes research-task rows back into the tracker.
- **AI Assistant:** `/chat` route - board-aware chat powered by MiniMax. Snapshot of every task injected into system prompt. Read-only - it suggests changes, doesn't make them.

## Stack diagram

```
   Telegram                Vercel web              Claude Code sessions
       |                       |                          |
   [agent bot]            [Next.js app]          [zao-pr-task / future
       |                       |                   zao-research-task /
       |                       |                   zao-inbox-task helpers]
       |                       |                          |
       +-----------------------+--------------------------+
                               |
                               v
                   Supabase Postgres `tasks` table
                   (project etwvzrmlxeobinrlytza, schema.sql)
                               |
                               v
                   public homepage + /login + Kanban board
                   live at https://www.thezao.xyz
```

Every writer hits the same table by UUID, so cross-source visibility is real: bot-created rows appear in the web UI instantly, and web edits land in the bot's next pull.

## Users

People live in the `team_members` table, not in code. There are **two ways to get
an account**, and the difference matters when you are adding someone.

### 1. Self-serve: Farcaster or wallet (preferred)

`/api/auth/farcaster` and `/api/auth/wallet` let someone sign in with a Farcaster
account or a wallet. On first sign-in `src/lib/identity.ts` inserts a
`team_members` row with `approval_status = 'pending'`; they can authenticate but
see nothing until an admin approves them at `/admin`.

`team_members.approval_status`:

| Value | Meaning |
|-------|---------|
| `active` | approved, full board access |
| `pending` | signed in via Farcaster/wallet, awaiting admin approval |
| `rejected` | denied (also set when `active = false`) |

Adding a teammate this way is **no deploy and no env var** - they sign in, you
approve the row. This is the path to use.

### 2. Legacy: per-user password env vars

The original scheme. Each person got a `<NAME>_PASSWORD` env var, checked at
`/login` against `src/lib/auth.ts`, which then issues the HMAC-signed
`iman-session` cookie. Both paths issue the same cookie, so everything
downstream is identical.

| User | Env var | Role |
|------|---------|------|
| Zaal | `ZAAL_PASSWORD` | core - also the fallback owner for unowned work (see below) |
| Iman | `IMAN_PASSWORD` | core (ZAO Devz lead) |
| ThyRev | `THYREV_PASSWORD` | core |
| Samantha | `SAMANTHA_PASSWORD` | core (candytoybox) |
| Tyler | `TYLER_PASSWORD` | external collaborator (Magnetiq) |

This path still works, but **adding a person requires a Vercel env var plus a
redeploy**, which is why it is no longer the default. Do not add new people this
way; use Farcaster/wallet + approval instead.

> Whichever path a person used, `team_members.legacy_owner` is the lowercase slug
> that `tasks.owner_id` resolves through. A member with no `legacy_owner` cannot
> own tasks and renders as "Both" on cards.

### Unowned work

`tasks.owner_id` is nullable, but an unowned task in `in_progress` is invisible
to every per-person surface (my-work, digests, mentions). The 15-minute
`auto-close` cron calls `adoptUnownedInProgress()`, which reassigns any such row
to **Zaal** as the operational backstop. Unowned `todo` rows are left alone -
those are legitimate unclaimed backlog.

New tasks also get the three basics filled in server-side by
`src/lib/task-defaults.ts` (owner, priority, due-from-service-class) so no row
can land incomplete regardless of which writer created it.

## Local dev

```bash
npm install
cp .env.example .env.local
# fill in: ZAAL_PASSWORD, IMAN_PASSWORD, THYREV_PASSWORD, SAMANTHA_PASSWORD,
# (optional TYLER_PASSWORD after merge), AUTH_SECRET (openssl rand -hex 32),
# SUPABASE_URL, SUPABASE_SERVICE_KEY,
# (optional MINIMAX_API_KEY for the AI Assistant tab)
npm run dev
```

Open `http://localhost:3000` -> redirects to `/login`.

## Deploy to Vercel

Repo is already deployed and live at thezao.xyz. To set up a new deploy:

1. Import this repo in Vercel.
2. Add env vars in Vercel project settings:
   - All `*_PASSWORD` vars listed above
   - `AUTH_SECRET` - 32+ random hex chars (`openssl rand -hex 32`)
   - `SUPABASE_URL` - `https://etwvzrmlxeobinrlytza.supabase.co`
   - `SUPABASE_SERVICE_KEY` - service-role key (server-side ONLY, never expose to browser)
   - `MINIMAX_API_KEY` / `MINIMAX_API_URL` / `MINIMAX_MODEL` - AI Assistant (Assistant tab degrades to 503 without these)
3. Deploy. Custom domain config maps `thezao.xyz` -> www subdomain.

## Data model

Live schema in `supabase/migrations/*.sql` (in theory - see `docs/MIGRATIONS.md`'s
"Known drift" section, several live tables have no migration file). `supabase/schema.sql`
and `db/schema.sql` are a greenfield reference schema, not necessarily what's
actually deployed - don't treat either as authoritative without checking the
live database. Key table: `public.tasks`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (pk) | Default `gen_random_uuid()`. Stable cross-source identifier. |
| `project` | text | Bucket. Default `zaodevz`. |
| `kind` | text | Real column, `'task'` / `'milestone'` (checked 2026-07-13) - **not** currently read by `data.ts`'s `TASK_COLUMNS` or used by the board UI. |
| `title` | text | One-line summary. |
| `status` | text | `todo` / `in_progress` / `blocked` / `done` (checked 2026-07-13 against the live CHECK constraint). The UI displays `in_progress` as **"WIP"** - that's a display label only, never the raw column value. |
| `owner_id` | uuid | FK to `team_members.id`. Actively used (`src/lib/data.ts`). |
| `category` | text | Free-form (`Ops`, `Tech`, `WaveWarZ Zambia`, etc.). |
| `priority` | text | `P1` / `P2` / `P3`. |
| `due` | date | Nullable. |
| `notes` | text | Long-form context, optional URL to PR comment or research doc. |
| `legacy_id` | text | Stable identifier for external writers (e.g. `pr-test-660`). |
| `legacy_source` | text | Provenance (e.g. `pr-auto:660`, `meeting:<slug>-<date>`, `inbox:<msg-id>`). |
| `brands` | text[] | Multi-select brand tags (used by `brandColor()` UI filter). |
| `metadata` | jsonb | Free-form extra context per writer. |

The `legacy_source` field is load-bearing: it tells the UI/bot where each row came from so a sweep can find/dedupe a class of writes (e.g. "all PR test-plan tasks" = `legacy_source LIKE 'pr-auto:%'`).

## Sub-modules

### `agent/` - Telegram bot

Standalone Node + TypeScript service that:
- Reads/writes the same Supabase `tasks` table
- Accepts natural-language `/add` with due/priority/notes/category extracted in one LLM call (no longer 4 separate ops)
- `/ping <name> [#id] [msg]` DMs a teammate via the bot
- Auto-pings the assignee when the web UI assigns a task to someone
- Runs under systemd on Iman's VPS (separate from VPS 1)

### `research-dispatch/` - Autonomous research pipeline

Cron-driven pipeline that picks a topic from a queue, runs research, writes a research-task row back into the tracker. Has its own `README.md` + `CLAUDE.md`. Currently marked "all 8 topics done (rounds 1-7 complete)" per latest commit.

### `db/` - Migrations + cowork import

- `schema.sql` - core Postgres schema (mirrors `supabase/schema.sql`)
- `migrate-cowork-actions.py` - one-shot migration script from the old GitHub Contents API `data/actions.json` into Supabase

## Cross-source writers (the integration layer)

These external systems write to the `tasks` table without being part of this repo. Each uses a distinct `legacy_source` prefix.

| Writer | `legacy_source` prefix | Source |
|--------|-----------------------|--------|
| Telegram bot | (none - bot writes go through normal columns) | `agent/` in this repo |
| ZAOOS `/meeting` skill action distribution | `meeting:<slug>-<date>` | [`~/.claude/skills/meeting/scripts/append-actions.sh`](https://github.com/bettercallzaal/ZAOOS/blob/main/.claude/skills/meeting/scripts/append-actions.sh) |
| Claude PR test-plan helper | `pr-auto:<pr-num>` | `~/bin/zao-pr-task` (shipped 2026-05-24) |
| Future: `/zao-research` doc-shipped tasks | `research-doc:<doc-num>` | planned |
| Future: `/inbox` action-items | `inbox:<message-id>` | planned |

Adding a new writer = pick a unique prefix, write rows with `apikey + service-role key` headers to `POST /rest/v1/tasks`, use bulk inserts where possible (Airtable limit is 10 records, Supabase is unlimited but be reasonable).

## UI features (the board)

- **Kanban** - 4 status columns (TODO / WIP / BLOCKED / DONE). Mobile = column tabs.
- **Quick add** - one input per column, press Enter, item appears.
- **Inline edit** - click priority dot to cycle P1/P2/P3. Status dropdown on each card. "edit" opens full modal.
- **Filters** - search, mine-only, aging-only, owner, category, priority, DMAIC phase, multi-select brand tags via `brandColor()` pills.
- **Saved views** - persist filter combos.
- **Stats bar** - open / my WIP / blocked / aging / done last 7 days.
- **Six Sigma signals** - aging badge (red after 14 days), cycle-time badge on Done items.
- **Help modal** - "?" button shows quick how-to + Six Sigma cheat.
- **AI Assistant** (`/chat`) - board-aware chat powered by MiniMax. Streams answers. The route handler injects a live snapshot of every task (status, owner, priority, age) into the system prompt, so you can ask "what's blocked?", "what should I work on?", "summarize Iman's WIP". Read-only.

## Process docs

- `SIX-SIGMA.md` - DMAIC, 5S, TIMWOODS, weekly review
- `BACKLOG.md` - Phase 2+ queue (mostly retired - most of it has shipped). Read before adding new features.
- `CLAUDE.md` - guidance for Claude Code sessions touching this repo
- `docs/PAPERS-AND-PHOTOS.md` - **start here** for the ZAO papers and the photo dashboard - overview + links to the docs below.
- `docs/shared-facts.md` - single-sourced facts (contract addresses, holder counts, the Fractal's week-count streak) that repeat across multiple ZAO papers. If a paper you're editing lives under `templates/`, edit there and run `npm run facts:apply` - `public/` for that page is generated output.
- `docs/PAPER-EDITING.md` - how anyone can propose an edit to a ZAO paper (GitHub PR flow) and how contributor attribution works.
- `docs/MANIFESTO-SIGNING-SETUP.md` - exact next steps to ship on-chain manifesto signing (Hats Protocol Agreement Eligibility) - what needs Zaal (deploy the hat/module, provision WalletConnect) vs. what's a normal build once those are done.

## Migration history

| Phase | What changed | When |
|-------|-------------|------|
| Phase 1 | Original `bettercallzaal/imanprojects` - Next.js + GitHub Contents API (every save = `git commit` on `data/actions.json`) | early 2026 |
| Phase 2 | Repo cloned to `ZAODEVZ/ZAOcowork` - migrated backend GitHub Contents API -> Supabase via `db/migrate-cowork-actions.py`. UUID becomes primary key. Bot starts writing to same table. | 2026-04-2026-05 |
| Phase 2.5 | Public homepage + `/login` gate (`ws/public-homepage` merged) + brand tags + brand-pill multi-filter | 2026-05 |
| Phase 2.6 | `/ping` bot command + ping-on-assign-from-web + NL `/add` one-op (no more 4-op split, no code-fence leakage) | 2026-05 |
| Phase 3 (in flight) | `ws/add-tyler-user` - 5th user, `userLabel()` helper | open PR |
| Phase 3 (in flight) | `research-dispatch/` - autonomous research pipeline writing tasks back | shipping |

## Migration path -> ZAO OS (deferred)

Original plan was to port the tracker into ZAO OS as a native module once Iman was comfortable. Current direction is the opposite: ZAOcowork stays standalone (graduated-out per CLAUDE.md monorepo-as-lab rule), ZAO OS calls into it as an external system via the Supabase REST API.

## License

See [LICENSE](LICENSE).
