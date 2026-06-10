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

This is a full ops/CRM/PM platform, not just a todo list — ~23 tables: tasks + dependencies + proposals, team/circles, brands/projects, events-CRM (sponsors/artists/volunteers/contacts/meeting-notes), budget/goals, activity/audit/notifications, and the bot control plane (`bot_heartbeats`, `bot_events`, `bot_commands`).

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
- **External `/api/v1/*`** — bot-token auth (`src/lib/bot-auth.ts` `authBot`, against `COWORK_BOT_TOKENS`). Reads (`GET /api/v1/bots`, `/api/v1/bots/:bot/events`) accept **either** a bot token **or** a logged-in session, so the board can render machine data. This is the **bot control plane** (doc 800): heartbeat, events, command queue (`/api/v1/bots/commands`).

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
| `src/middleware.ts` | Edge middleware — redirects unauthenticated requests to `/login`. Cookie check only (HMAC is in `requireSession`). |
| `src/app/api/chat/route.ts` | `POST` MiniMax proxy — auth-gated, board-aware system prompt, streams tokens. **Server-only.** |

### Client/server boundary

`Board.tsx` and `TodoPanel.tsx` import from `src/lib/types` and `src/lib/todo-parser` only (both safe). They must **never** import from `src/lib/data` (server-only). Server actions from `src/app/actions.ts` cross the boundary via Next.js `"use server"`.

### Data model

`ActionItem` key fields:

```
dbId (row UUID), id (= legacy_id, the route key), title, createdBy,
owner (derived: Open|<name>|Both), assignees[] (the authoritative people list),
status (TODO|WIP|BLOCKED|DONE), category, priority (P1|P2|P3), phase (DMAIC),
due, notes, important, urgent, createdAt, updatedAt, completedAt, completedBy
taskType?, requiresApproval?, claimable?, serviceClass?, archivedAt?
brands[]?, projectId?, source?, legacyId?, legacySource?
comments?: Comment[], updates?: TaskUpdate[], activity?: ActivityEvent[]
```

`assignees` (lowercase login slugs) is the source of truth for "whose task is this" (`isAssignedTo`/`effectiveAssignees`); legacy `owner` is kept derived (0→Open, 1→that person, 2+→Both) for badges/filters. `Both` resolves to **Zaal + Iman only** — never "whoever's logged in" (that was the new-user "owns everything" bug). `claimable: true` marks Todo-created ownerless tasks — cards show an amber **CLAIM** badge.

### Todo feature

`TodoPanel` → `parseText()` (in `todo-parser.ts`) → preview → `todoProcess()` server action. Parser splits text into lines, detects task-like lines (list markers + action verbs), matches existing tasks by Jaccard word-overlap (threshold 0.38). Matched lines → `update_status`/`add_note`; unmatched task-like lines → `create`.

### Approval workflow

Opt-in: a task only needs review when flagged `requiresApproval: true`. Then `reviewStatus: "pending"` — status doesn't change until a lead approves via `reviewUpdate`. Otherwise updates apply immediately. Review queue surfaces in `TaskRoom` and the column header badge.

## Database migrations

Schema is managed by `supabase/migrations/NNN_*.sql` (single source of truth). Apply with `supabase db push` (see `docs/MIGRATIONS.md` for the one-time `supabase link` + `migration repair` baseline). The read-only `supabase-cowork` MCP **cannot** run DDL — migrations go through the CLI or the dashboard SQL editor. When hand-applying in the dashboard, keep the migration file in the repo so git stays the source of truth.

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
