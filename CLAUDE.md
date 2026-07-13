# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at http://localhost:3000
npm run build    # production build — TypeScript + Next.js compile
npm run lint     # ESLint via next lint
npm run test     # vitest run (unit tests, e.g. src/lib/types.test.ts)
npm run start    # run production build locally

npm run db:list  # supabase migration list (local vs remote)
npm run db:new   # supabase migration new
npm run db:push  # supabase db push (apply pending migrations)
npm run db:diff  # supabase db diff
```

Validate changes with `npm run test` + `npx tsc --noEmit` (both run in CI), then `npm run build` and manual browser testing for UI work.

## ZAO papers (public/, templates/)

`public/*.html` and `public/papers/**/*.html` are the static ZAO whitepapers served at thezao.xyz/papers, wired up via rewrites in `next.config.mjs`. `npm run build` runs `node scripts/apply-facts.mjs` before `next build` - this regenerates 7 of those files from `templates/` + `data/facts.json` and **overwrites whatever is in `public/` for those 7 files**.

**Before editing any paper, check `templates/` first** (`templates/paper.html`, `templates/papers/what-is-the-zao.html`, `templates/papers/technical.html`, `templates/papers/the-zao-protocol.html`, `templates/papers/drafts/history.html`, `templates/papers/drafts/wavewarz.html`, `templates/llms.txt`). If the paper you're touching has a matching path there, edit the template, not `public/` - edits to `public/` for these 7 files are silently overwritten on the next build or `npm run facts:apply`. Every other paper has no template and is still edited directly in `public/`. See `docs/shared-facts.md` for the full workflow and which facts are single-sourced.

## Environment variables

Copy `.env.example` to `.env.local`. The data layer is **Supabase** — the two `SUPABASE_*` vars are required for the app to function locally.

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` | Supabase project URL (e.g. `https://etwvzrmlxeobinrlytza.supabase.co`) — **required** |
| `SUPABASE_SERVICE_KEY` | Service-role key — server-side data layer reads/writes **all** rows — **required**, never exposed to the browser |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Reserved for any future client-side Supabase use; the server path uses the service key |
| `AUTH_SECRET` | 32+ hex chars for HMAC cookie signing |
| `ZAAL_PASSWORD` / `IMAN_PASSWORD` | Lead login passwords |
| `THYREV_PASSWORD` / `SAMANTHA_PASSWORD` / `TYLER_PASSWORD` | Additional teammate login passwords |
| `COWORK_BOT_TOKENS` | Comma-joined `name=token` map authorizing the bot fleet against `/api/v1/*` (e.g. `zoe=tok_…,zaodevz=tok_…`) |
| `MINIMAX_API_KEY` | MiniMax key for the `/chat` Assistant — optional; `/api/chat` returns 503 without it |
| `MINIMAX_API_URL` / `MINIMAX_MODEL` | Optional overrides (default `https://api.minimax.io/v1/chat/completions`, `MiniMax-M2.7`) |
| `OPENROUTER_API_KEY` | Optional alternate LLM provider |
| `RESEND_API_KEY` / `DIGEST_FROM_ADDRESS` / `DIGEST_RECIPIENTS` / `DIGEST_CRON_TOKEN` | Email digest delivery (`/api/digest`, `/api/my-digest`) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_GROUP_CHAT_ID` | Telegram notifications |
| `GITHUB_TOKEN` / `GITHUB_WEBHOOK_SECRET` | GitHub PR-status webhook + auto-close on merge (`/api/github/webhook`) |
| `AUTOCLOSE_KEY` | Auth for the scheduled auto-close job |
| `APP_BASE_URL` / `NEXT_PUBLIC_APP_URL` | Absolute base URL for links/emails |

## Git remote & deploy

The only remote is `origin` → `https://github.com/ZAODEVZ/ZAOcowork`. Work happens on feature branches → PR → `main`. **Merging to `main` deploys to Vercel** (`thezao.xyz`).

## Architecture

**Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v3. **Data layer: Supabase (Postgres).** `src/lib/data.ts` wraps Supabase with the service-role key; the schema lives in `supabase/migrations/*.sql` and `supabase/schema.sql`.

This is a full ops/CRM/PM platform, not just a todo list — 28 tables as of 2026-07-13 (verified against the live schema, not just `supabase/migrations/`): tasks + dependencies + proposals, team/circles, brands/projects, events-CRM (sponsors/artists/volunteers/contacts/contact_log/meeting_notes), budget/goals, activity/audit/comment_notifications, the bot control plane (`bot_heartbeats`, `bot_events`, `bot_commands`, `bot_tokens`, `token_claims`, `task_source_cache`), and `photos` (the Fotocaster dashboard). **Several of these have no migration file in git** — see `docs/MIGRATIONS.md`'s "Known drift" section before assuming a table doesn't exist just because you can't find its `CREATE TABLE`.

### Data flow

```
Browser → Server Action (actions.ts)
  → requireSession() — verifies HMAC cookie
  → getActions() — reads the tasks table from Supabase (paginated by UUID pk;
                   PostgREST silently caps a plain select at 1000 rows)
  → mutate in memory
  → saveActions() / applyDiff() — writes back to Supabase, keyed by the row UUID (dbId)
  → revalidatePath("/") — triggers server re-render
```

The activity/audit trail lives in the `activity` metadata + dedicated audit tables, not in git commits.

### Task identity (important)

A task's **app-facing `id` is its `legacy_id`** (`row.legacy_id ?? row.id`), and that id is the URL/route key (`?task=<id>`, `/todo/<id>`). `legacy_id` is always a clean number: a `BEFORE INSERT` trigger (`tasks_slug_guard`, migration `015`) auto-assigns the next number from `tasks_legacy_id_seq` to any row inserted with a NULL/non-numeric `legacy_id`, stashing the original slug in `metadata.source_slug`. So **external writers never need to compute ids** — the DB owns assignment. `newId()` mirrors this (max+1) for app-created rows.

### Writers that converge on the `tasks` table

The board UI, the Telegram agent, the `/meeting` flow, `zao-tracker`, the bot fleet (`pushItem`/`markDone` via `/api/v1`), and GitHub auto-close-on-merge all write tasks. Nothing upserts on `(legacy_source, legacy_id)` — plain INSERTs + UUID-keyed updates — so the slug-guard renumbering is collision-free.

### Two API surfaces

- **Internal `/api/*`** — session-cookie auth, serves the board (digest, my-digest, my-mentions, team, github webhook, chat…).
- **External `/api/v1/*`** — bot-token auth (`src/lib/bot-auth.ts` `authBot`, against `COWORK_BOT_TOKENS` env or the `bot_tokens` table, 60s cache). Reads (`GET /api/v1/bots`, `/api/v1/bots/:bot/events`) accept **either** a bot token **or** a logged-in session, so the board can render machine data. This is the **bot control plane** (doc 800): heartbeat, events, command queue (`/api/v1/bots/commands`, `commands/:id/result`), plus `/api/v1/claim` (redeem a one-time pairing code for a bot token — not currently in `docs/BOT-API.md`, see that doc's own note).

  **Heartbeat is live, but not from any code committed to this repo** (corrected 2026-07-13 after checking `bot_heartbeats` directly — an earlier version of this note said heartbeats were "unused," which was wrong). 5 bots are actively reporting `up` (`zoe`, `zaostock`, `zaodevz`, `zaocoworking`, `farscout`), all with heartbeats within the last couple minutes when checked. `zoe` is `@zaoclaw_bot` from the separate ZAOOS repo, per `docs/BOT-API.md`'s per-bot table — that one's expected. `zaocoworking` matches this repo's own agent (`agent/systemd/zaocoworking-bot.service`), but a repo-wide grep for `"heartbeat"` across `agent/` and `ops/` finds zero matches — meaning whatever sends that heartbeat is an uncommitted script on the VPS, not part of this git history. Same root cause as the database schema drift in `docs/MIGRATIONS.md`: things get set up directly against production and never make it back into git. **The command queue has real history but is currently dormant** — `bot_commands` has exactly 3 rows, all from 2026-06-07: `zaostock` pulled and completed a `pause` and a `resume` within seconds of being enqueued, `zoe` did the same for an `ask`. So it has worked end-to-end at least once, by bots outside this repo — it's not vaporware. It just hasn't been used since (over a month of silence as of this check), and nothing in this repo's own code (`agent/`, `research-dispatch/`) ever calls it.

### AI chat flow

```
/chat page (server) — auth gate, renders <Chat>
  → <Chat> (client) POSTs { messages } to /api/chat
  → route handler: requireSession() verifies HMAC
  → getActions() loads the live board
  → builds a board-aware system prompt (status/owner/priority/age snapshot)
  → fetches MiniMax with stream:true
  → transforms OpenAI-style SSE into a plain UTF-8 token stream, strips <think> tags
  → <Chat> reads the stream and appends tokens to the assistant bubble
```

The system prompt is built server-side only; any client-supplied `system` role is dropped. The MiniMax key never reaches the browser. The assistant is read-only — it suggests board changes, it does not call mutations.

### Auth & roles

`src/lib/auth.ts` — no NextAuth. Passwords checked against env vars, then an HMAC-signed `iman-session` cookie is set (`user.expiry.sig` format). Middleware checks cookie presence; `requireSession()` verifies the HMAC before any mutation. `isLead(user)` / `isAdmin(user)` gate elevated actions.

**Roles:**
- **Leads/admins** (`zaal`, `iman`) — full permissions: delete tasks, review (approve/reject) updates on tasks flagged `requiresApproval`, plus everything workers can do. `isAdmin` additionally gates the bot control-plane write actions (control/task/ask).
- **Workers** (other teammates, e.g. `thyrev`) — create tasks, submit updates, claim tasks, change status freely **including DONE**. Cannot delete or review.

The active roster is **dynamic** (teammates added via `/admin`), surfaced to assignee pickers through the auth-gated `GET /api/team` — not a hardcoded list.

Approval is **opt-in per task**, not forced by role: submissions apply directly (status change included) unless the task itself has `requiresApproval: true`.

**Permission tier model** (audited 2026-07-13 — `src/lib/auth.ts:40-69`, enforced per-action across `src/app/actions.ts` and `src/app/admin/actions.ts`):

| Tier | Gate | Routes / actions |
|------|------|-------------------|
| Auto | `requireSession()` | board read, search, `/chat`, own task edits, `claimTask`, `quickAdd` |
| Notify | `requireSession()` + audit log | `bulkSetStatus`/`bulkSetOwner`/`bulkSetPriority`/`bulkAddBrand`, `bulkMoveToTriage`, comments |
| Ask | `requireSession()` + `isLead()` OR `isAdmin()` | `/admin/triage`, `/admin/cleanup`, `/admin/proposals`, `/admin/feed`, `reviewUpdate`, `approveProposal`/`rejectProposal`, `bulkArchive`, `bulkAssignUnowned` |
| Block | `requireAdmin()` | `/admin` Users/Brands/BulkOps/Audit panels, `/admin/projects`, `bulkDelete` |

`isLead` is a hardcoded allowlist (`zaal`, `iman`, `shawn`) — a deliberate "founders can't get locked out" glass-break, not a DB-driven role. `isAdmin` is DB-role-driven (`team_members.role`) with the same zaal/iman fallback if the role column or row is ever missing. `deleteItem` is gated `isLead() OR isAdmin()`, not `requireAdmin()` alone — intentional (a comment at the call site notes this was changed so hardcoded leads without a DB admin role can't be locked out of deleting); if you're expecting Block-tier-only deletion, this is the one exception.

### Portals & pages

| Route | Purpose |
|-------|---------|
| `/` | Dev board — ZAO Devz, Site/Tech, Ops, Bounty, Other (blue) |
| `/music` | WaveWarZ Zambia, Recording, Distribution, Release, Artist Onboarding (purple) |
| `/marketing` | Social, Brand, Content, Campaigns (amber) |
| `/bots` | Fleet liveness + control plane (session-gated; reads `/api/v1/bots`) |
| `/my-work` | Per-user assigned tasks + @mentions |
| `/activity` | Activity feed + my-mentions |
| `/shipped` | Public shipped feed |
| `/chat` | MiniMax Assistant |
| `/crm` | Contacts (`contacts`/`contact_log` tables, 849 rows live as of 2026-07-13 — Airtable-imported, no import script lives in this repo) |
| `/meetings` | Meeting scheduling + Google Calendar push (best-effort) + email `.ics` invites (best-effort, via Resend) |
| `/calendar` | Tasks + meetings on one calendar view |
| `/admin` | Ask/Block-tier panels: Triage, Cleanup, Proposals, Feed, Users/Brands/BulkOps/Audit (admin-only), Projects |
| `/photos` | Fotocaster photo dashboard (Ask tier for uploads/status changes) — see `docs/PAPERS-AND-PHOTOS.md` |

Each board portal is a server component that filters tasks by its category list and renders `<Board>`. Navigation via `<NavBar>`.

### Key files

| File | Role |
|------|------|
| `src/lib/types.ts` | All domain types + pure utils (`ageDays`, `cycleDays`, `effectiveAssignees`, `isAssignedTo`). **No Node/browser imports** — safe in client components. |
| `src/lib/data.ts` | Re-exports `types.ts` + **Supabase** I/O: `getActions`, `saveActions`, `applyDiff`, `normalizeItem`, `newId`, `rowToItem`/`itemToRow`. **Server-only.** Paginates reads past the PostgREST 1000-row cap. |
| `src/lib/auth.ts` | `verifyPassword`, `createSession`, `getSession`, `requireSession`, `isLead`, `isAdmin`. |
| `src/lib/bot-auth.ts` | `authBot` — bot-token auth for `/api/v1/*` against `COWORK_BOT_TOKENS`. |
| `src/lib/supabase-server.ts` | `serviceClient` — service-role Supabase client. |
| `src/lib/todo-parser.ts` | Client-safe text→task parser. Pure functions. Used by `TodoPanel`. |
| `src/app/actions.ts` | All `"use server"` mutations: `createItem`, `quickCreate`, `updateItem`, `patchField`, `deleteItem`, `addComment`, `submitUpdate`, `reviewUpdate`, `setAssignees`, `todoProcess`, `claimTask`, `logout`. |
| `src/app/api/v1/bots/*` | Control plane: `heartbeat`, `events`, `commands`, `:bot/events`, `:bot/commands`, `commands/:id/result`. |
| `src/components/Board.tsx` | Main client UI: Kanban columns, filter bar, cards, Todo trigger. `"use client"`. |
| `src/components/TaskRoom.tsx` | Full-screen slide-in panel for a task: details, timeline, comments, updates, review queue, assignee checkboxes. |
| `src/components/TodoPanel.tsx` | Floating ✦ Todo button + 3-phase modal. Calls `todoProcess` and `claimTask`. |
| `src/components/BotsBoard.tsx` | `/bots` fleet liveness + control-plane UI (admin-gated controls). |
| `src/middleware.ts` | Edge middleware — redirects unauthenticated requests to `/login`. Cookie check only (HMAC is in `requireSession`). Correctly excludes `/api/v1/*` (bot-token auth handled in-route, not here). |
| `src/app/api/chat/route.ts` | `POST` MiniMax proxy — auth-gated, board-aware system prompt, streams tokens. **Server-only.** |
| `src/lib/contacts.ts` | CRM data layer over the `contacts`/`contact_log` tables. **Server-only.** |
| `src/lib/meetings.ts`, `google-calendar.ts`, `meeting-invite.ts` | Meetings CRUD + best-effort Google Calendar push + best-effort `.ics` email invites (Resend). Both integrations degrade gracefully when unconfigured — never block meeting creation. |
| `src/lib/proposals.ts` | AI-proposal approval queue (`task_proposals` table) — `/admin/proposals`, Ask tier. |
| `src/lib/photos.ts`, `src/app/photos/actions.ts` | Fotocaster photo dashboard data layer + server actions. **Separate from `src/app/actions.ts`** — a deliberate split-file convention this repo already uses for `admin/actions.ts` and `meetings/actions.ts`; new features should follow it rather than growing the 1486-line `src/app/actions.ts` further. |

### Client/server boundary

`Board.tsx` and `TodoPanel.tsx` import from `src/lib/types` and `src/lib/todo-parser` only (both safe). They must **never** import from `src/lib/data` (server-only). Server actions from `src/app/actions.ts` cross the boundary via Next.js `"use server"`.

### Data model

`ActionItem` key fields:

```
dbId (row UUID), id (= legacy_id, the route key), title, createdBy,
owner (derived: Open|<name>|Both), assignees[] (the authoritative people list),
status (TRIAGE|TODO|WIP|BLOCKED|DONE), category, priority (P1|P2|P3), phase (DMAIC),
due, notes, important, urgent, createdAt, updatedAt, completedAt, completedBy
taskType?, requiresApproval?, claimable?, serviceClass?, archivedAt?
brands[]?, projectId?, source?, legacyId?, legacySource?
comments?: Comment[], updates?: TaskUpdate[], activity?: ActivityEvent[]
```

`assignees` (lowercase login slugs) is the source of truth for "whose task is this" (`isAssignedTo`/`effectiveAssignees`); legacy `owner` is kept derived (0→Open, 1→that person, 2+→Both) for badges/filters. `Both` resolves to **Zaal + Iman only** — never "whoever's logged in" (that was the new-user "owns everything" bug). `claimable: true` marks Todo-created ownerless tasks — cards show an amber **CLAIM** badge.

Note: the underlying `tasks` table's `status` CHECK constraint stores `in_progress`, not `wip` — `WIP` is only the UI display label (`types.ts`), never the raw DB value. Same pattern for `kind`: the column exists in the live schema (`'task'` / `'milestone'`) but isn't part of `TASK_COLUMNS` in `data.ts` and isn't used by the board today.

**TRIAGE** (audited 2026-07-13) is a real status, not just a doc mention — external writers (the NL `/todo` parser, Telegram bot, `/meeting` skill, research-dispatcher) default new items to `TRIAGE` so a human picks owner/brand/priority/service-class before the card hits the main board. `Board.tsx` explicitly filters `TRIAGE` out of the main Kanban view; `/admin/triage` (Ask tier) is the only place to route a triage item onto the board or reject it.

**Task `source`** (audited 2026-07-13, `src/lib/types.ts`) — every task carries provenance: `human-web`, `human-bot`, `meeting-capture`, `research-dispatch`, `pr-test-task`, `ai-proposal`, `system-cleanup`, `external-api`. Not previously documented here; useful for "find all tasks that came from X" sweeps (same idea as the `legacy_source` prefix convention above, but a real typed enum rather than a string-prefix match).

**Archive** (audited 2026-07-13) is Ask tier (`bulkArchive` — `requireLeadOrAdmin()`), not open to workers; a code comment cites this as a deliberate tightening (workers could previously archive/hide tasks unilaterally). Auto-archive at a 30-day threshold also exists (`types.ts`).

**Task dependencies auto-unblock**: when a task's status changes to `DONE` (via `patchField` or an approved `reviewUpdate`), tasks it was blocking are automatically unblocked (`onTaskClosed` in `actions.ts`) — not previously documented.

**AI proposals** (`task_proposals` table, `src/lib/proposals.ts`) — a real, live approval queue at `/admin/proposals` (Ask tier). An external system (or a future agent) can propose a field change (`set_brands`/`set_owner`/`set_service_class`/`set_priority`/`flag_duplicate`/`add_comment`/`move_status`) with a confidence score and rationale; a lead/admin approves or rejects via `approveProposal`/`rejectProposal`. Not previously mentioned outside BACKLOG.md's stale "future work" framing — it's built and live.

### Todo feature

`TodoPanel` → `parseText()` (in `todo-parser.ts`) → preview → `todoProcess()` server action. Parser splits text into lines, detects task-like lines (list markers + action verbs), matches existing tasks by Jaccard word-overlap (threshold 0.38). Matched lines → `update_status`/`add_note`; unmatched task-like lines → `create`.

### Approval workflow

Opt-in: a task only needs review when flagged `requiresApproval: true`. Then `reviewStatus: "pending"` — status doesn't change until a lead approves via `reviewUpdate`. Otherwise updates apply immediately. Review queue surfaces in `TaskRoom` and the column header badge.

## Database migrations

Schema is managed by `supabase/migrations/NNN_*.sql` (single source of truth, in theory). Apply with `supabase db push` (see `docs/MIGRATIONS.md` for the one-time `supabase link` + `migration repair` baseline). The read-only `supabase-cowork` MCP **cannot** run DDL — migrations go through the CLI or the dashboard SQL editor. When hand-applying in the dashboard, keep the migration file in the repo so git stays the source of truth. **In practice this hasn't always happened** — 16 of 28 live tables have no migration file (audited 2026-07-13). Before concluding a table doesn't exist because you can't find its `CREATE TABLE`, check the live schema directly; see `docs/MIGRATIONS.md`'s "Known drift" section for the full list and why it happened.

## UI conventions

- All interactive inputs use `bg-[#0b1220]` (solid dark) — never `bg-transparent` or `bg-black/30`.
- Modals/overlays use `bg-[#07111e]` with `border border-white/[0.12]`.
- Owner badge colors: Zaal = blue, Iman = purple, ThyRev = emerald, Both = slate.
- Priority dots: P1 = red, P2 = amber, P3 = emerald.
- `zao-ink` = `#0f1d33`, `zao-navy` = `#0a1628`, `zao-accent` = `#3b82f6`.

## Roadmap (status)

- **Phase 2 — Supabase migration: ✅ done.** `data.ts` runs on Supabase; the old `data/actions.json` / GitHub-Contents path is retired (`legacy_source` tags pre-migration rows).
- **Phase 3 — Bot API (`/api/v1/*`): ✅ done.** Bearer-token control plane (doc 800) for the bot fleet.
- **Phase 4 — Hermes / agent coordination: in progress.** Telegram agent, fleet heartbeats/events/commands; remaining work is daily summaries + broader agent task-assignment.

## ICM Context Boxes (AI-readable ZAO context)

Fetch a box to load grounded context on any ZAO project or person:
- `curl -s https://useicm.com/api/objects/<id>/llm.txt` ; directory https://thezao.xyz/list
- Start box: **zao-assistant** `icm_-hsPHePpqX01RovoB_SEqA` (links to thezao, bettercallzaal, zabalgamez, wavewarz, farcaster, fractal, poidh, zuke, zao-festivals, coc-concertz, zao-newsletter, loop-engineering, milk-road).
- Source of truth: `research/identity/icm-boxes/` in ZAOOS.
