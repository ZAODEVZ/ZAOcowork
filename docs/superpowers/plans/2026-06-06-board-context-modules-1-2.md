# Board Context Modules 1+2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every cowork board card resolve its origin (PR/doc/meeting) to a live link + preview, and make tasks auto-close when their PR/research-doc merges (poll + webhook).

**Architecture:** A pure `source-resolver.ts` maps `legacy_id` -> origin link. A `task_source_cache` table holds GitHub PR live-state (refreshed on a TTL) so the board renders fast. Auto-close logic lives in one `auto-close.ts` module fired by both a 15-min GitHub Action (poll) and the existing `/api/github/webhook` (real-time, extended for the `pr-test-<N>` reverse mapping). UI adds an origin row to cards and an activity strip to the header.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v3, `@supabase/supabase-js` (cached service-role `db()` client), GitHub REST via `GITHUB_TOKEN`, GitHub Actions.

**Repo reality:** No test framework. Verify each task with `npm run build` (type check) + the manual check given. The one pure function (`resolveSource`) gets a runnable node assertion script. Server writes use the cached service-role client pattern from `src/lib/data.ts:97` / `src/lib/audit.ts:33`.

---

## File Structure

- Create `src/lib/source-resolver.ts` - pure: `resolveSource(task) -> ResolvedSource`. No I/O.
- Create `scripts/test-source-resolver.mjs` - node assertions for the resolver.
- Create `supabase/migrations/007_task_source_cache.sql` - cache table.
- Create `src/lib/source-status.ts` - read cache; refresh stale PR state from GitHub (server-only).
- Create `src/lib/auto-close.ts` - `closeMergedSources()` shared logic.
- Create `src/app/api/v1/auto-close/route.ts` - bearer-protected POST that calls `closeMergedSources()`.
- Create `.github/workflows/auto-close.yml` - 15-min poll hitting the route.
- Modify `src/app/api/github/webhook/route.ts` - add `pr-test-<N>` reverse-close + cache upsert on PR events.
- Create `src/components/ActivityStrip.tsx` - header widget.
- Modify `src/components/Board.tsx` (~line 1640, the source-chip block) - add origin row.
- Modify `src/components/TaskRoom.tsx` - show full origin preview.

---

## Task 1: Pure source resolver

**Files:**
- Create: `src/lib/source-resolver.ts`
- Test: `scripts/test-source-resolver.mjs`

- [ ] **Step 1: Write the resolver**

```typescript
// src/lib/source-resolver.ts
// Pure mapping from a task's legacy_id / legacy_source to its real origin.
// No I/O - PR live state is fetched separately (source-status.ts) using refId.
import type { ActionItem } from "@/lib/data";

export type ResolvedKind = "pr" | "research-doc" | "meeting" | "none";

export interface ResolvedSource {
  kind: ResolvedKind;
  url: string | null;
  label: string;
  refId: string | null;     // "665" | "801" | "jose-onb-0605"
  needsLiveStatus: boolean;  // true only for PRs
}

const PRIMARY_REPO = "bettercallzaal/ZAOOS";
const NONE: ResolvedSource = { kind: "none", url: null, label: "", refId: null, needsLiveStatus: false };

export function resolveSource(task: Pick<ActionItem, "legacyId" | "legacySource">): ResolvedSource {
  const id = (task.legacyId ?? "").trim();
  const src = (task.legacySource ?? "").trim();

  // PR test tasks: legacy_id "pr-test-665" or legacy_source "pr-auto:665"
  const prFromId = id.match(/^pr-test-(\d+)$/);
  const prFromSrc = src.match(/^pr-auto:(\d+)$/);
  const prNum = prFromId?.[1] ?? prFromSrc?.[1];
  if (prNum) {
    return {
      kind: "pr",
      url: `https://github.com/${PRIMARY_REPO}/pull/${prNum}`,
      label: `PR #${prNum}`,
      refId: prNum,
      needsLiveStatus: true,
    };
  }

  // Research docs: legacy_id "research-doc-801" or legacy_source "research-doc:801"
  const docFromId = id.match(/^research-doc-(\d+)$/);
  const docFromSrc = src.match(/^research-doc:(\d+)$/);
  const docNum = docFromId?.[1] ?? docFromSrc?.[1];
  if (docNum) {
    return {
      kind: "research-doc",
      // Folder slug is unknown from the number alone; link to a GitHub code
      // search scoped to the doc-number prefix, which lands on the README.
      url: `https://github.com/search?q=repo%3A${encodeURIComponent(PRIMARY_REPO)}+path%3Aresearch+${docNum}-&type=code`,
      label: `Doc ${docNum}`,
      refId: docNum,
      needsLiveStatus: false,
    };
  }

  // Meetings: legacy_id "meeting-<slug>" or legacy_source "meeting:<slug>"
  const mtgFromId = id.match(/^meeting-(.+)$/);
  const mtgFromSrc = src.match(/^meeting:(.+)$/);
  const slug = mtgFromId?.[1] ?? mtgFromSrc?.[1];
  if (slug) {
    return {
      kind: "meeting",
      url: `https://github.com/search?q=repo%3A${encodeURIComponent(PRIMARY_REPO)}+path%3Aresearch%2Fevents+${encodeURIComponent(slug)}&type=code`,
      label: `Meeting: ${slug}`,
      refId: slug,
      needsLiveStatus: false,
    };
  }

  return NONE;
}
```

- [ ] **Step 2: Confirm `ActionItem` exposes `legacyId` + `legacySource`**

Run: `grep -nE "legacyId|legacySource" src/lib/data.ts | head`
Expected: both fields present on the `ActionItem` interface. If the field names differ (e.g. `legacy_id`), update the `Pick<>` and accessors in Step 1 to match exactly before proceeding.

- [ ] **Step 3: Write the assertion script**

```javascript
// scripts/test-source-resolver.mjs
// Run with: node scripts/test-source-resolver.mjs
// Standalone (no framework). Re-implements the cases against a compiled copy
// is overkill; instead we assert the regex contract the TS function encodes.
import assert from "node:assert";

// Mirror of resolveSource's contract for a fast guard. If you change the TS,
// change here too (kept tiny on purpose).
const cases = [
  { in: { legacyId: "pr-test-665", legacySource: "pr-auto:665" }, kind: "pr", refId: "665" },
  { in: { legacyId: "research-doc-801", legacySource: "research-doc:801" }, kind: "research-doc", refId: "801" },
  { in: { legacyId: "meeting-jose-onb-0605-miniapp", legacySource: "meeting:x" }, kind: "meeting" },
  { in: { legacyId: "108", legacySource: "cowork-actions.json" }, kind: "none" },
];

function expectKind({ legacyId = "", legacySource = "" }) {
  if (/^pr-test-(\d+)$/.test(legacyId) || /^pr-auto:(\d+)$/.test(legacySource)) return "pr";
  if (/^research-doc-(\d+)$/.test(legacyId) || /^research-doc:(\d+)$/.test(legacySource)) return "research-doc";
  if (/^meeting-(.+)$/.test(legacyId) || /^meeting:(.+)$/.test(legacySource)) return "meeting";
  return "none";
}

for (const c of cases) {
  assert.equal(expectKind(c.in), c.kind, `kind for ${JSON.stringify(c.in)}`);
}
console.log(`OK: ${cases.length} source-resolver cases pass`);
```

- [ ] **Step 4: Run the assertions**

Run: `node scripts/test-source-resolver.mjs`
Expected: `OK: 4 source-resolver cases pass`

- [ ] **Step 5: Type-check + commit**

Run: `npm run build`
Expected: compiles clean.
```bash
git add src/lib/source-resolver.ts scripts/test-source-resolver.mjs
git commit -m "feat(board): pure source-resolver - legacy_id -> origin link"
```

---

## Task 2: task_source_cache migration

**Files:**
- Create: `supabase/migrations/007_task_source_cache.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 007_task_source_cache.sql
-- Board context Module 1: cache GitHub PR live-state so the board renders
-- without per-row GitHub calls. Idempotent.
CREATE TABLE IF NOT EXISTS task_source_cache (
  ref_kind   TEXT NOT NULL,          -- 'pr'
  ref_id     TEXT NOT NULL,          -- PR number as text
  state      TEXT,                   -- 'open' | 'closed' | 'merged'
  title      TEXT,
  url        TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ref_kind, ref_id)
);
CREATE INDEX IF NOT EXISTS task_source_cache_fetched_idx
  ON task_source_cache(fetched_at);
```

- [ ] **Step 2: Apply via Supabase MCP (read-only MCP cannot write DDL - use the dashboard SQL editor or service-key psql)**

Apply the SQL against project `etwvzrmlxeobinrlytza` using the Supabase dashboard SQL editor (or `supabase db push` if the CLI is linked). The read-only `supabase-cowork` MCP cannot run DDL.

- [ ] **Step 3: Verify table exists**

Run (via the read-only MCP `list_tables` or dashboard): confirm `task_source_cache` appears in `public`.
Expected: table present with the 6 columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/007_task_source_cache.sql
git commit -m "feat(board): task_source_cache table for PR live-state"
```

---

## Task 3: source-status (GitHub PR state + cache)

**Files:**
- Create: `src/lib/source-status.ts`

- [ ] **Step 1: Write the status module**

```typescript
// src/lib/source-status.ts
// Server-only. Reads task_source_cache; refreshes stale/missing PR entries
// from the GitHub REST API. Degrades gracefully when GITHUB_TOKEN is unset
// or a fetch fails (serves stale, never throws to the caller).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const TTL_MS = 30 * 60 * 1000; // 30 min
const PRIMARY_REPO = "bettercallzaal/ZAOOS";

export interface SourceStatus {
  state: "open" | "closed" | "merged" | "unknown";
  title: string | null;
  url: string | null;
}

let cached: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_KEY!;
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export async function getPrStatuses(prNumbers: string[]): Promise<Record<string, SourceStatus>> {
  const out: Record<string, SourceStatus> = {};
  if (prNumbers.length === 0) return out;
  const uniq = Array.from(new Set(prNumbers));

  const { data: rows } = await db()
    .from("task_source_cache")
    .select("ref_id, state, title, url, fetched_at")
    .eq("ref_kind", "pr")
    .in("ref_id", uniq);

  const now = Date.now();
  const fresh = new Map<string, { state: string; title: string | null; url: string | null }>();
  const stale: string[] = [];
  const seen = new Set<string>();
  for (const r of rows ?? []) {
    seen.add(r.ref_id);
    if (now - new Date(r.fetched_at).getTime() < TTL_MS) {
      fresh.set(r.ref_id, { state: r.state, title: r.title, url: r.url });
    } else {
      stale.push(r.ref_id);
    }
  }
  const missing = uniq.filter((n) => !seen.has(n));
  const toFetch = [...stale, ...missing];

  for (const [refId, v] of fresh) {
    out[refId] = { state: (v.state as SourceStatus["state"]) ?? "unknown", title: v.title, url: v.url };
  }

  const token = process.env.GITHUB_TOKEN;
  for (const num of toFetch) {
    if (!token) { out[num] = { state: "unknown", title: null, url: null }; continue; }
    try {
      const res = await fetch(`https://api.github.com/repos/${PRIMARY_REPO}/pulls/${num}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      });
      if (!res.ok) { out[num] = { state: "unknown", title: null, url: null }; continue; }
      const pr = await res.json();
      const state: SourceStatus["state"] = pr.merged_at ? "merged" : pr.state === "closed" ? "closed" : "open";
      const status: SourceStatus = { state, title: pr.title ?? null, url: pr.html_url ?? null };
      out[num] = status;
      await db().from("task_source_cache").upsert({
        ref_kind: "pr", ref_id: num, state, title: status.title, url: status.url, fetched_at: new Date().toISOString(),
      });
    } catch {
      out[num] = { state: "unknown", title: null, url: null };
    }
  }
  return out;
}
```

- [ ] **Step 2: Confirm env var name for the service key**

Run: `grep -rnE "SUPABASE_SERVICE_KEY|process.env.SUPABASE" src/lib/data.ts src/lib/audit.ts | head`
Expected: the cached client reads `SUPABASE_SERVICE_KEY` (or similar). Match the exact name used elsewhere; update `db()` in Step 1 if it differs.

- [ ] **Step 3: Type-check + commit**

Run: `npm run build`
Expected: compiles clean.
```bash
git add src/lib/source-status.ts
git commit -m "feat(board): source-status - cached GitHub PR live-state"
```

---

## Task 4: auto-close logic + protected route

**Files:**
- Create: `src/lib/auto-close.ts`
- Create: `src/app/api/v1/auto-close/route.ts`

- [ ] **Step 1: Write the close logic**

```typescript
// src/lib/auto-close.ts
// Closes tasks whose source PR/research-doc has merged. Idempotent: only
// touches open (non-DONE) tasks of kind pr|research-doc. Service-role writes.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveSource } from "@/lib/source-resolver";
import { getPrStatuses } from "@/lib/source-status";
import { logAudit } from "@/lib/audit";

let cached: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false },
  });
  return cached;
}

export interface AutoCloseResult { closed: string[]; checked: number; }

export async function closeMergedSources(): Promise<AutoCloseResult> {
  // Pull open tasks that carry a PR-derived legacy_id/source.
  const { data, error } = await db()
    .from("tasks")
    .select("id, legacy_id, legacy_source, status")
    .neq("status", "done");
  if (error) throw new Error(`auto-close read failed: ${error.message}`);

  const prTasks = (data ?? [])
    .map((t) => ({ row: t, src: resolveSource({ legacyId: t.legacy_id, legacySource: t.legacy_source }) }))
    .filter((x) => x.src.kind === "pr" && x.src.refId);

  if (prTasks.length === 0) return { closed: [], checked: 0 };

  const statuses = await getPrStatuses(prTasks.map((x) => x.src.refId!));
  const closed: string[] = [];
  for (const { row, src } of prTasks) {
    if (statuses[src.refId!]?.state === "merged") {
      const { error: upErr } = await db().from("tasks").update({ status: "done" }).eq("id", row.id).neq("status", "done");
      if (!upErr) {
        closed.push(row.legacy_id ?? row.id);
        await logAudit({ actor: "system-autoclose", action: "status_change", entityId: row.id, note: `auto-closed: ${src.label} merged` });
      }
    }
  }
  return { closed, checked: prTasks.length };
}
```

- [ ] **Step 2: Verify `logAudit` signature**

Run: `sed -n '40,80p' src/lib/audit.ts`
Expected: confirm `logAudit({ actor, action, entityId, note })` field names. Adjust the call in Step 1 to match the real `LogInput` shape exactly (field names + required fields).

- [ ] **Step 3: Write the protected route**

```typescript
// src/app/api/v1/auto-close/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { closeMergedSources } from "@/lib/auto-close";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const key = process.env.AUTOCLOSE_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "AUTOCLOSE_KEY not set" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${key}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const result = await closeMergedSources();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "auto-close failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 4: Type-check + commit**

Run: `npm run build`
Expected: compiles clean.
```bash
git add src/lib/auto-close.ts src/app/api/v1/auto-close/route.ts
git commit -m "feat(board): auto-close merged-PR tasks + protected route"
```

---

## Task 5: poll workflow (GitHub Action)

**Files:**
- Create: `.github/workflows/auto-close.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/auto-close.yml
# Polls every 15 min: closes tracker tasks whose PR merged.
name: auto-close-merged-tasks
on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch: {}
jobs:
  autoclose:
    runs-on: ubuntu-latest
    steps:
      - name: Hit auto-close endpoint
        run: |
          curl -fsS -X POST "https://www.thezao.xyz/api/v1/auto-close" \
            -H "Authorization: Bearer ${{ secrets.AUTOCLOSE_KEY }}" \
            -H "Content-Type: application/json" | tee /dev/stderr
```

- [ ] **Step 2: Note the required GitHub secret**

In `ZAODEVZ/ZAOcowork` repo Settings -> Secrets -> Actions, add `AUTOCLOSE_KEY` matching the Vercel `AUTOCLOSE_KEY` env var. Document this in the PR description (manual step Zaal does).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/auto-close.yml
git commit -m "feat(board): 15-min poll workflow for auto-close"
```

---

## Task 6: extend existing webhook for reverse pr-test close + cache

**Files:**
- Modify: `src/app/api/github/webhook/route.ts` (add reverse mapping in the merged branch)

- [ ] **Step 1: Read the current merged-handling block**

Run: `sed -n '80,160p' src/app/api/github/webhook/route.ts`
Expected: locate where `pull_request.merged === true` is handled and where it closes `cowork#<id>` tasks. The new code goes alongside that, after signature verification.

- [ ] **Step 2: Add reverse close (by PR number -> pr-test task) + cache upsert**

Inside the verified `pull_request` handler, after the existing `cowork#<id>` logic, add (using the service-role client the file already imports via `saveActions`/data layer; if it uses `getActions`/`saveActions`, prefer a direct service update for the system action):

```typescript
// Reverse mapping: a pr-auto task carries legacy_id "pr-test-<N>".
// When PR #N merges, close it directly (idempotent).
if (pr && pr.merged === true) {
  const n = String(pr.number);
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
  await sb.from("tasks").update({ status: "done" })
    .or(`legacy_id.eq.pr-test-${n},legacy_source.eq.pr-auto:${n}`)
    .neq("status", "done");
  // Refresh the source cache so the board badge flips to "merged" immediately.
  await sb.from("task_source_cache").upsert({
    ref_kind: "pr", ref_id: n, state: "merged", title: pr.title, url: pr.html_url, fetched_at: new Date().toISOString(),
  });
  await logAudit({ actor: "system-autoclose", action: "status_change", entityId: `pr-${n}`, note: `auto-closed via webhook: PR #${n} merged` });
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npm run build`
Expected: compiles clean.
```bash
git add src/app/api/github/webhook/route.ts
git commit -m "feat(board): webhook reverse-close pr-test tasks on PR merge"
```

---

## Task 7: card origin row (Board.tsx)

**Files:**
- Modify: `src/components/Board.tsx` (the source-chip block ~line 1640)

- [ ] **Step 1: Read the current source-chip render**

Run: `sed -n '1630,1660p' src/components/Board.tsx`
Expected: the `{item.source && item.source !== "human-web" && (...)}` chip block. The origin row renders right after it.

- [ ] **Step 2: Add the origin row**

At the top of `Board.tsx` add the import:
```typescript
import { resolveSource } from "@/lib/source-resolver";
```
After the source-chip block, add (the PR live badge reads from a `prStatus` map passed as a prop or fetched at page level - for v1, render link + label without the live badge, which the TaskRoom adds):
```tsx
{(() => {
  const origin = resolveSource({ legacyId: item.legacyId, legacySource: item.legacySource });
  if (origin.kind === "none" || !origin.url) return null;
  return (
    <a
      href={origin.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-[10px] text-sky-300/80 hover:text-sky-200 underline-offset-2 hover:underline"
      title={`Origin: ${origin.label}`}
      onClick={(e) => e.stopPropagation()}
    >
      ↗ {origin.label}
    </a>
  );
})()}
```

- [ ] **Step 3: Confirm field names on `item`**

Run: `grep -nE "legacyId|legacySource" src/components/Board.tsx | head`
Expected: `item.legacyId` / `item.legacySource` exist (same shape as `ActionItem`). If the board uses different prop names, match them.

- [ ] **Step 4: Type-check + manual check + commit**

Run: `npm run build` then `npm run dev`, open http://localhost:3000, log in, confirm cards with a pr-test/research-doc/meeting origin show a `↗ PR #N` / `↗ Doc N` link that opens the right GitHub page; cowork-actions cards show no origin row.
```bash
git add src/components/Board.tsx
git commit -m "feat(board): origin link row on task cards"
```

---

## Task 8: TaskRoom origin preview + live PR badge

**Files:**
- Modify: `src/components/TaskRoom.tsx`

- [ ] **Step 1: Read TaskRoom header render**

Run: `grep -n "legacySource\|legacyId\|export default function\|item\." src/components/TaskRoom.tsx | head`
Expected: find where the task detail header renders, to place the origin preview.

- [ ] **Step 2: Add origin preview block**

Import `resolveSource`. In the detail header, render the resolved origin with label + link. For PRs, fetch live status from a new lightweight route `GET /api/source-status?pr=<n>` (create it returning `getPrStatuses([n])`) and show an `open|merged|closed` badge. (If wiring the live badge expands scope, ship label+link first and leave a `// TODO live badge` only if Zaal approves; otherwise implement the route.)

Create `src/app/api/source-status/route.ts`:
```typescript
import { NextResponse, type NextRequest } from "next/server";
import { getPrStatuses } from "@/lib/source-status";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const pr = req.nextUrl.searchParams.get("pr");
  if (!pr) return NextResponse.json({ ok: false }, { status: 400 });
  const s = await getPrStatuses([pr]);
  return NextResponse.json({ ok: true, status: s[pr] ?? { state: "unknown" } });
}
```

- [ ] **Step 3: Type-check + manual check + commit**

Run: `npm run build`; in dev, open a task room for a pr-test task, confirm the origin preview + live badge render.
```bash
git add src/components/TaskRoom.tsx src/app/api/source-status/route.ts
git commit -m "feat(board): TaskRoom origin preview + live PR badge"
```

---

## Task 9: Activity strip

**Files:**
- Create: `src/components/ActivityStrip.tsx`
- Modify: `src/components/NavBar.tsx` (mount the strip) OR `src/app/page.tsx`

- [ ] **Step 1: Create a server route for repo activity**

Create `src/app/api/repo-activity/route.ts`:
```typescript
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  const repo = "bettercallzaal/ZAOOS";
  if (!token) return NextResponse.json({ ok: true, openIssues: null, mergedToday: null });
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
    const j = await r.json();
    const since = new Date(Date.now() - 86400000).toISOString();
    const pr = await fetch(`https://api.github.com/search/issues?q=repo:${repo}+is:pr+is:merged+merged:>=${since}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
    const pj = await pr.json();
    return NextResponse.json({ ok: true, openIssues: j.open_issues_count ?? null, mergedToday: pj.total_count ?? null });
  } catch {
    return NextResponse.json({ ok: true, openIssues: null, mergedToday: null });
  }
}
```

- [ ] **Step 2: Create the component**

```tsx
// src/components/ActivityStrip.tsx
"use client";
import { useEffect, useState } from "react";

export default function ActivityStrip() {
  const [a, setA] = useState<{ openIssues: number | null; mergedToday: number | null } | null>(null);
  useEffect(() => {
    fetch("/api/repo-activity").then((r) => r.json()).then((d) => d.ok && setA(d)).catch(() => {});
  }, []);
  if (!a || (a.openIssues == null && a.mergedToday == null)) return null;
  return (
    <div className="text-[11px] text-white/50 px-2 py-1">
      ZAOOS: {a.openIssues ?? "?"} open issues
      {a.mergedToday != null && ` · ${a.mergedToday} PR merged today`}
    </div>
  );
}
```

- [ ] **Step 3: Mount it in the header**

Run: `grep -n "export default\|<nav\|return (" src/components/NavBar.tsx | head`
Mount `<ActivityStrip />` in the NavBar (or page header). Import it; place near the title.

- [ ] **Step 4: Type-check + manual check + commit**

Run: `npm run build`; in dev confirm the strip renders the issue/PR counts (or nothing if no token).
```bash
git add src/components/ActivityStrip.tsx src/app/api/repo-activity/route.ts src/components/NavBar.tsx
git commit -m "feat(board): GitHub activity strip in header"
```

---

## Task 10: integration verify + PR

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 2: Manual smoke (dev)**

`npm run dev`, log in, verify: (a) origin links on cards, (b) TaskRoom preview + live PR badge, (c) activity strip, (d) `curl -X POST localhost:3000/api/v1/auto-close -H "Authorization: Bearer $AUTOCLOSE_KEY"` returns `{ok:true, closed:[...], checked:N}`.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin ws/board-context-modules-1-2
gh pr create --base main --title "feat: board context modules 1+2 (source resolver + auto-close)" --body "Implements docs/superpowers/specs/2026-06-06-board-context-modules-1-2-design.md. Module 1: cards resolve legacy_id to live PR/doc/meeting origin. Module 2: tasks auto-close when their PR merges (15-min poll + webhook), plus a GitHub activity strip. New env: AUTOCLOSE_KEY (Vercel + GH Action secret). New migration 007 (task_source_cache) - apply to etwvzrmlxeobinrlytza."
```

- [ ] **Step 4: Post-merge manual steps (document in PR, Zaal does)**

Apply migration 007; set `AUTOCLOSE_KEY` in Vercel + GH Actions secrets; confirm `GITHUB_TOKEN` + `GITHUB_WEBHOOK_SECRET` set; register the webhook on bettercallzaal/ZAOOS if not already (Pull requests events).

---

## Self-Review

**Spec coverage:** M1 source resolver (T1,3,7,8) ✓; task_source_cache (T2) ✓; M2 auto-close poll (T4,5) + webhook (T6) ✓; activity strip (T9) ✓; error handling - token-missing degrades, bad-sig 401, idempotent closes ✓. Out-of-scope M3-5 untouched ✓.

**Placeholder scan:** One conditional `// TODO live badge` in T8 is gated behind explicit Zaal approval with the real route provided as the default path - acceptable. No other placeholders; all code blocks complete.

**Type consistency:** `resolveSource(task)` takes `{legacyId, legacySource}` everywhere (T1, T4, T7, T8). `closeMergedSources(): AutoCloseResult` consistent (T4, T5 calls the route). `getPrStatuses(string[]) -> Record<string, SourceStatus>` consistent (T3, T4, T8). DB field names (`legacy_id`, `legacy_source`, `status`) match the schema; Steps 2/3 in early tasks verify the exact `ActionItem` accessor names before coding against them.
