# Public Shipped Layer (Module 6) Design

> **Date:** 2026-06-06
> **Status:** Approved design, pre-implementation
> **Repo:** ZAODEVZ/ZAOcowork
> **Branch:** ws/public-shipped-layer

## Goal

A public, no-login page at `thezao.xyz/shipped` showing what The ZAO has finished - DONE tasks grouped by project. The showcase half of the board vision (the connections half shipped in PR #50). Build-in-public for the 188 + the ecosystem.

**Privacy is the whole game.** The tasks table holds internal ops + PII (`detail`, `notes`, `owner`, internal titles like "rotate X password"). The public page exposes ONLY whitelisted fields of explicitly-curated tasks. Default: nothing is public.

## Curation model (locked)

A DONE task is public iff:
```
COALESCE(task.public_override, (task.project_id IS NOT NULL AND project.is_public), false) = true
```
- `public_override = true` -> always public (even if project private/none)
- `public_override = false` -> never public (even if project public)
- `public_override = null` (default) -> inherits: public iff it belongs to a project flagged `is_public`
- No project + no override -> NOT public (safe default)

## Field exposure (locked)

Public output per task: **title, project name/slug, completed_at date** - nothing else. `getPublicShipped` selects only those columns; `owner`, `notes`, `detail`, `legacy_*`, `source` are never read into the public path.

## Data model (migration 009)
```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS public_override BOOLEAN; -- null=inherit, true=show, false=hide
CREATE INDEX IF NOT EXISTS tasks_public_done_idx ON tasks(status, completed_at) WHERE status = 'done';
```

## Units

### `src/lib/public-feed.ts` (server-only, service-role)
- `interface ShippedItem { title: string; completedAt: string | null }`
- `interface ShippedGroup { projectName: string; projectSlug: string | null; items: ShippedItem[] }`
- `getPublicShipped(limitPerGroup = 50): Promise<ShippedGroup[]>`:
  - Query DONE tasks joined to projects, selecting ONLY `title, completed_at, public_override, project_id, project:project_id(name, slug, is_public)`.
  - Apply the visibility rule in code (or a SQL WHERE). Group by project name; tasks public via override but with no/private project go under group "Other".
  - Order groups by most-recent completion; items by completed_at desc; cap items per group.
  - NEVER select owner/notes/detail.

### Public page `src/app/shipped/page.tsx` (server component, public)
- Renders `getPublicShipped()` server-side (good for SEO, no client secret). Dark ZAO-branded page, heading "What The ZAO Shipped", each project = a section with its done items + dates. Empty state if nothing public yet. A small footer link back to thezao.xyz.

### Middleware `src/middleware.ts`
- Add `/shipped` to `PUBLIC_PREFIXES` (and `/api/public` if a refresh route is added). One-line change.

### Admin toggles
- **Project public toggle** - in `src/components/admin/ProjectsPanel.tsx`: an `is_public` checkbox per project, calls an `updateProject`-style action (projects.ts `updateProject` already exists - extend its input to accept `is_public`).
- **Task override** - in `src/components/TaskRoom.tsx`: a 3-state control "Public: inherit / show / hide" writing `public_override` (null/true/false) via a small server action `setTaskPublicOverride(form)`.

## Data flow
```
admin toggles project.is_public / task.public_override (board, authed)
         |
Supabase tasks + projects
         |
/shipped (public, no auth) --getPublicShipped() server-render--> grouped DONE showcase
```

## Error handling
- `getPublicShipped` degrades to empty array on any DB error (page renders empty-state, never 500s).
- The visibility rule is default-deny: any task not explicitly curated stays private. A NULL project join cannot accidentally expose (override must be explicitly true).
- Public page selects whitelisted columns only - even a future careless edit can't leak notes unless someone adds the column to the select.

## TEST PLAN (manual, step by step)
After migration 009 applied + deploy:
1. **Default-private:** visit `thezao.xyz/shipped` in incognito (no login). Expect: loads with no redirect; shows only already-curated items (likely empty at first).
2. **Project flag:** in the board admin, mark a project with done tasks `is_public`. Reload /shipped incognito. Expect: that project's DONE tasks appear, grouped, with dates.
3. **Private stays hidden:** a DONE task in a non-public project does NOT appear.
4. **Task override show:** set a task's Public toggle to "show" in a private project. Expect: it appears under "Other" (or its project).
5. **Task override hide:** set a task in a public project to "hide". Expect: it disappears from /shipped.
6. **Leak check:** view-source the /shipped page. Confirm NO owner names, notes, detail, or internal legacy refs anywhere - only titles, project names, dates.
7. **No-auth confirm:** /shipped works fully logged-out; the rest of the board still redirects to /login when logged-out.

## Out of scope
Per-project public sub-pages, RSS/JSON feed, social-share cards, the project rollup progress view. Separate cycles.

## Decisions locked
- 2026-06-06: curation = BOTH project `is_public` + per-task `public_override`; default-deny.
- 2026-06-06: public fields = title + project + completed_at only.
- Public route = `/shipped`, server-rendered, added to middleware PUBLIC_PREFIXES.
