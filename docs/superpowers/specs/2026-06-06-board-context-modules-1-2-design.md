# Board Context Level-Up - Modules 1+2 Design

> **Date:** 2026-06-06
> **Status:** Approved design, pre-implementation
> **Repo:** ZAODEVZ/ZAOcowork (the cowork tracker board, live at thezao.xyz)
> **Branch:** ws/board-context-modules-1-2

## Goal

Turn the cowork board from a flat list of context-poor task cards into a context-rich command center wired into the ZAO ecosystem. A card today shows a bare title + an opaque `legacy_source`; you can't see the doc/PR/meeting it came from, and nothing closes tasks when their underlying work ships - which is why the board accumulated 300+ stale tasks (cleaned 2026-06-06, 98 closed).

This spec covers the first two of five modules. Modules 3-5 (project rollups, ecosystem sidebar, AI triage agent) are out of scope here and get their own spec/plan cycles.

## The 5-module vision (context only)

| # | Module | Status |
|---|--------|--------|
| 1 | Source resolver - cards resolve `legacy_id` to a live link + preview | **THIS SPEC** |
| 2 | GitHub auto-close + activity strip - tasks self-close when PR/doc merges | **THIS SPEC** |
| 3 | Project/initiative rollups | future (projects table already scaffolded, migration 006) |
| 4 | Ecosystem sidebar (people/brand/Bonfire links) | future |
| 5 | AI triage agent (MiniMax acting, not just suggesting) | future |

## Existing foundations (already in the repo - build on these, do not duplicate)

- `tasks.legacy_id` + `tasks.legacy_source` - carry the granular origin reference (`pr-test-665`, `research-doc-801`, `meeting-jose-onb-0605-miniapp`, `cowork-actions.json`).
- `tasks.source` enum + `TASK_SOURCE_LABELS`/`TASK_SOURCE_COLORS` (types.ts) - the source CATEGORY chip already renders on cards (Board.tsx ~1640). Module 1 adds the resolved LINK the chip lacks.
- `projects` table + `tasks.project_id` (migration 006) - reserved for Module 3.
- Auth: HMAC cookie (`src/lib/auth.ts`). DB: Supabase project `etwvzrmlxeobinrlytza`. Stack: Next.js 15 App Router, React 19, Tailwind v3, `@supabase/supabase-js`.

## Module 1 - Source resolver

### Unit: `src/lib/source-resolver.ts` (pure, testable, no I/O)
```
type ResolvedSource = {
  kind: 'pr' | 'research-doc' | 'meeting' | 'none'
  url: string | null          // external link (GitHub blob / PR)
  label: string               // "PR #665" | "Doc 801" | "Jose call 06-05"
  refId: string | null        // "665" | "801" | "jose-onb-0605"
  needsLiveStatus: boolean     // true for PRs (fetch merge state)
}
function resolveSource(task: Task): ResolvedSource
```
Pattern-matches `legacy_id` first, falls back to `legacy_source`:
- `^pr-test-(\d+)$` or `legacy_source ^pr-auto:(\d+)` -> kind `pr`, url `https://github.com/bettercallzaal/ZAOOS/pull/<N>`, needsLiveStatus true.
- `^research-doc-(\d+)$` -> kind `research-doc`, url to the doc's README on GitHub (resolve folder by number via a known path map or a GitHub search), preview = the `> **Goal:**` line.
- `^meeting-(.+)$` or `legacy_source ^meeting:(.+)` -> kind `meeting`, url to the `research/events/NNN-*` recap if resolvable, else label-only.
- else -> kind `none` (human-entered; no backlink).

### Unit: PR/doc live-status cache
- New table `task_source_cache` (migration 007): `ref_kind text, ref_id text, state text, title text, url text, fetched_at timestamptz`, PK `(ref_kind, ref_id)`.
- `src/lib/source-status.ts`: `getSourceStatus(refs)` reads cache; for stale/missing entries (TTL ~30 min) batch-fetches GitHub PR state (`gh`/REST) and upserts. Server-only (uses `GITHUB_TOKEN`).
- Rationale: board renders from cache (fast, no per-render rate-limit risk); refresh is amortized.

### Unit: card UI (modify `src/components/Board.tsx` + `TaskRoom.tsx`)
- Card gains an "origin" row under the title: source icon + clickable `label` link + live badge (`open`/`merged`/`closed` for PRs) when cached.
- TaskRoom (the per-task detail) shows the full preview (PR title, doc Goal line, meeting date).
- Cards with `kind: 'none'` render unchanged (no origin row).

## Module 2 - GitHub auto-close + activity

### Auto-close (BOTH poll + webhook, per decision 2026-06-06)

**Shared close logic** - `src/lib/auto-close.ts`:
```
closeMergedSources(): for each open task with kind pr|research-doc,
  if PR merged (or doc PR merged) -> set status='DONE',
  append audit row source='system-cleanup', note 'auto-closed: <ref> merged'.
Idempotent (only acts on open tasks).
```

**Poll runner (baseline, ship first):** a scheduled trigger every ~15 min calls `closeMergedSources()`.
- Implementation: GitHub Actions workflow in ZAOcowork (`.github/workflows/auto-close.yml`) hitting a protected API route `POST /api/v1/auto-close` (bearer `AUTOCLOSE_KEY`), OR a Supabase scheduled edge function. Choose GitHub Action (simplest, no edge-fn deploy) for v1.

**Webhook (real-time, layer on after poll works):** `POST /api/webhooks/github` verifies the `X-Hub-Signature-256` HMAC (`GITHUB_WEBHOOK_SECRET`), on `pull_request.closed` with `merged=true` closes tasks for that PR number. Registered on bettercallzaal/ZAOOS.

### Activity strip - `src/components/ActivityStrip.tsx`
- Header widget: recent merged PRs + open issue count per active repo (ZAOOS first), from a cached GitHub query (reuse `task_source_cache` pattern or a small `repo_activity_cache`). Read-only, collapsible.

## Data flow

```
GitHub (PRs/issues) --poll(15m)/webhook--> /api/v1/auto-close | /api/webhooks/github
                                                    |
                                                    v  (close merged) + cache PR state
                                         Supabase tasks + task_source_cache
                                                    |
   Board render --resolveSource()+cache--> context-rich cards + ActivityStrip
```

## Error handling
- GitHub rate limit / token missing: resolver degrades to link-without-live-status (never blocks render). Cache serves stale on fetch failure.
- Unresolvable `legacy_id`: kind `none`, card renders plain (no crash).
- Webhook bad signature: 401, no DB write. Poll is the safety net if webhook misfires.
- Auto-close only ever sets `DONE` on tasks already `kind: pr|research-doc` AND merged - never touches human-entered tasks.

## Testing
No test suite in repo (per CLAUDE.md). Validate: (1) `npm run build` clean (types), (2) unit-test `resolve-source` logic with a fixtures table of legacy_ids, (3) manual: load board, confirm origin rows + badges; merge a test PR, confirm poll closes its task; fire a signed webhook payload, confirm instant close.

## Out of scope
Modules 3 (rollups), 4 (ecosystem sidebar), 5 (AI agent). No changes to auth, the Telegram bot, or research-dispatch beyond reading their `legacy_id` output.

## Decisions locked
- 2026-06-06: Module 2 auto-close = BOTH poll (baseline) + webhook (real-time).
- 2026-06-06: Build M1+M2 first; 3-5 later.
- Source of PR truth: `bettercallzaal/ZAOOS` (primary). Other repos additive later.
