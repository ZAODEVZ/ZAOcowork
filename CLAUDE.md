# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at http://localhost:3000
npm run build    # production build — TypeScript + Next.js compile (use this to catch type errors)
npm run lint     # ESLint via next lint
npm run start    # run production build locally
```

No test suite. Validate changes with `npm run build` then manual browser testing.

## Environment variables

Copy `.env.example` to `.env.local`:

| Var | Purpose |
|-----|---------|
| `ZAAL_PASSWORD` | Login password for Zaal (lead) |
| `IMAN_PASSWORD` | Login password for Iman (lead) |
| `THYREV_PASSWORD` | Login password for ThyRev (worker) |
| `AUTH_SECRET` | 32+ hex chars for HMAC cookie signing |
| `GITHUB_TOKEN` | Fine-grained PAT with `contents:write` — required on Vercel for saves to persist |
| `GITHUB_REPO` | `songchaindao-dot/cowork-zaodevz` |
| `GITHUB_BRANCH` | `main` |
| `MINIMAX_API_KEY` | MiniMax key for the `/chat` Assistant — optional; `/api/chat` returns 503 without it |
| `MINIMAX_API_URL` / `MINIMAX_MODEL` | Optional overrides (default `https://api.minimax.io/v1/chat/completions`, `MiniMax-M2.7`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Phase 2 — leave blank until Supabase migration |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Phase 2 |

Without `GITHUB_TOKEN`, saves fall back to `data/actions.json` on local disk.

## Git remotes

The only remote is `origin` → `https://github.com/songchaindao-dot/cowork-zaodevz`:

```bash
git push origin main   # deploys to Vercel
```

## Architecture

**Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v3. No database — data lives in `data/actions.json`, persisted via GitHub Contents API commits.

### Data flow

```
Browser → Server Action (actions.ts)
  → requireSession() — verifies HMAC cookie
  → getActions() — reads data/actions.json from GitHub Contents API
  → mutate in memory
  → saveActions() — writes back via GitHub Contents API (creates a commit)
  → revalidatePath("/") — triggers server re-render
```

Every save is a git commit — the commit history is the audit log.

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

`src/lib/auth.ts` — no NextAuth. Passwords checked against env vars, then an HMAC-signed `iman-session` cookie is set (`user.expiry.sig` format). Middleware checks cookie presence; `requireSession()` verifies the HMAC before any mutation.

**Two roles:**
- **Leads** (`zaal`, `iman`) — full permissions: delete tasks, review (approve/reject) updates on tasks explicitly flagged `requiresApproval`, plus everything workers can do.
- **Workers** (`thyrev`) — create tasks, submit updates, claim tasks, change status freely **including DONE**. Cannot delete or review.

Approval is **opt-in per task**, not forced by role: submissions apply directly unless the task itself has `requiresApproval: true`. `isLead(user)` in `auth.ts` still gates lead-only actions — `reviewUpdate`, `deleteItem` — so leads/admins keep delete + optional review, but nobody has to approve every submission.

### Three portals

| Route | Categories | Background tint |
|-------|-----------|-----------------|
| `/` | Dev — ZAO Devz, Site/Tech, Ops, Bounty, Other | Blue |
| `/music` | WaveWarZ Zambia, Recording, Distribution, Release, Artist Onboarding | Purple |
| `/marketing` | Social, Brand, Content, Campaigns | Amber |

Each portal is a separate server component that filters `doc.items` by its category list and renders `<Board>`. Navigation between portals via `<NavBar>`.

### Key files

| File | Role |
|------|------|
| `src/lib/types.ts` | All domain types + pure utils (`ageDays`, `cycleDays`). **No Node/browser imports** — safe to use in client components. |
| `src/lib/data.ts` | Re-exports `types.ts` + server-side I/O: `getActions`, `saveActions`, `normalizeItem`, `newId`. **Server-only** (uses `node:fs`). |
| `src/lib/auth.ts` | `verifyPassword`, `createSession`, `getSession`, `requireSession`, `isLead`. |
| `src/lib/todo-parser.ts` | Client-safe text→task parser. Pure functions, no imports from server or browser APIs. Used by `TodoPanel`. |
| `src/app/actions.ts` | All `"use server"` mutations: `createItem`, `quickCreate`, `updateItem`, `patchField`, `deleteItem`, `addComment`, `submitUpdate`, `reviewUpdate`, `todoProcess`, `claimTask`, `logout`. |
| `src/components/Board.tsx` | Main client UI: Kanban columns, filter bar, cards, Todo trigger + panel. `"use client"`. |
| `src/components/TaskRoom.tsx` | Full-screen slide-in panel for a single task: details form, activity timeline, comments, update submission, review queue. |
| `src/components/TodoPanel.tsx` | Floating ✦ Todo button + 3-phase modal (input → preview → done). Calls `todoProcess` and `claimTask`. |
| `src/middleware.ts` | Edge middleware — redirects unauthenticated requests to `/login`. Cookie check only (no HMAC — that's in `requireSession`). |
| `src/app/api/chat/route.ts` | `POST` MiniMax proxy — auth-gated, builds the board-aware system prompt, streams tokens back. **Server-only.** |
| `src/app/chat/page.tsx` | Server component: auth gate, renders `<Chat>`. |
| `src/components/Chat.tsx` | `"use client"` streaming chat UI for the Assistant tab. |

### Client/server boundary

`Board.tsx` and `TodoPanel.tsx` import from `src/lib/types` and `src/lib/todo-parser` only (both safe). They must **never** import from `src/lib/data` (Node.js only). Server actions from `src/app/actions.ts` cross the boundary via Next.js `"use server"`.

### Data model

`ActionItem` key fields:

```
id, title, createdBy, owner (Zaal|Iman|ThyRev|Both), status (TODO|WIP|BLOCKED|DONE)
category, priority (P1|P2|P3), phase (DMAIC), due, notes, important, urgent
createdAt, updatedAt, completedAt, completedBy
taskType?, requiresApproval?, assignedTo?, claimable?
comments?: Comment[], updates?: TaskUpdate[], activity?: ActivityEvent[]
```

`claimable: true` marks tasks created via Todo with no owner — cards show an amber **CLAIM** badge and button. Claiming sets `owner` to the claimer and `claimable: false`.

### Todo feature

`TodoPanel` → `parseText()` (in `todo-parser.ts`) → preview → `todoProcess()` server action.

Parser logic: splits text into lines, detects task-like lines (list markers + action verbs), matches against existing tasks by Jaccard word-overlap (threshold 0.38). Matched lines produce `update_status` or `add_note` actions; unmatched task-like lines produce `create` actions. Owner/status/priority extracted from keywords.

### Approval workflow

Approval is opt-in: a task only needs review when it's explicitly flagged `requiresApproval: true` (regardless of who submits — there's no role-based forced approval). When an update requires approval, `reviewStatus: "pending"` — status doesn't change until a lead approves via `reviewUpdate`. Otherwise updates apply immediately. Review queue surfaces in `TaskRoom` (LogPanel) and the column header badge.

## UI conventions

- All interactive inputs use `bg-[#0b1220]` (solid dark) — never `bg-transparent` or `bg-black/30`.
- Modals/overlays use `bg-[#07111e]` with `border border-white/[0.12]`.
- Owner badge colors: Zaal = blue, Iman = purple, ThyRev = emerald, Both = slate.
- Priority dots: P1 = red, P2 = amber, P3 = emerald.
- `zao-ink` = `#0f1d33`, `zao-navy` = `#0a1628`, `zao-accent` = `#3b82f6`.

## Phase roadmap

- **Phase 2:** Swap `src/lib/data.ts` for Supabase (keep identical exported function signatures so `actions.ts` is untouched). See `BACKLOG.md`.
- **Phase 3:** Bot API (`/api/v1/items`) with bearer token auth for Hermes agent.
- **Phase 4:** Hermes imanagent on VPS — Telegram bot, daily summaries, slash commands.
