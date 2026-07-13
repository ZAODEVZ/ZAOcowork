# BACKLOG - future phases

Phase 1 ships now (UI/UX overhaul + Six Sigma structure). Everything below queued for after.

Order = roughly recommended sequence, not strict.

**Update 2026-07-13 (audit correction):** Phase 2 and Phase 3 below are stale -
both have shipped in substance (CLAUDE.md's own Architecture section has
described Supabase as the live data layer, and the bot control plane, for a
while). The individual checkboxes were never gone back and checked off, so
don't take an unchecked box here as "not done" - verify against the live
code/schema first (this file has a track record of drifting, see also
`docs/MIGRATIONS.md`'s "Known drift" section). Not independently re-verified
line by line: the realtime-subscription item, the OpenAPI spec, `/docs/api`
page, and outbound webhook item specifically - those may still be genuinely
open.

---

## Phase 2: Storage swap to Supabase

**Why:** GitHub-commit-per-save = ~30s redeploy noise + can't do realtime sync. Supabase = instant saves, realtime subscriptions, RLS.

**Work:**
- [ ] Create Supabase project (Zaal will do this when ready)
- [ ] Schema migration: `items`, `item_audit`, `categories`, `bot_keys` tables
- [ ] RLS policies (zaal+iman read+write; bot key bypass via service_role)
- [ ] Refactor `src/lib/data.ts` - swap GitHub Contents API for Supabase client (keep same function signatures so `src/app/actions.ts` stays untouched)
- [ ] Realtime subscription on `items` table -> both users see edits live
- [ ] One-time data migration script: read current `data/actions.json`, insert into `items` table
- [ ] Add Supabase env vars to Vercel
- [ ] Smoke test
- [ ] Decom `data/actions.json` (keep file for git audit history)

**Risk:** RLS misconfiguration leaks data. Test in staging.

---

## Phase 3: Bot API + auth

**Why:** Hermes agent + future automations need a stable API surface separate from user passwords.

**Work:**
- [ ] `/api/v1/items` - GET list, POST create, PATCH update, DELETE
- [ ] Bearer token auth via `HERMES_API_KEY` env (or `bot_keys` table for multi-key)
- [ ] Rate limit (e.g. 60 req/min per key)
- [ ] OpenAPI spec at `/api/v1/openapi.json`
- [ ] API docs page at `/docs/api` (auth-gated)
- [ ] Webhook out: when item changes status, POST to optional webhook URL (Telegram, FC, Slack, etc)

**Risk:** Bot key leak = full write access. Use service_role only inside API route, never client-side.

---

## Phase 4: Hermes imanagent on VPS

**Why:** Automate daily summary, inbox parsing, slash commands. Iman doesn't have to open the site.

**Prereqs:** Phase 2 + Phase 3 done. Existing Hermes setup details from Zaal.

**Work:**
- [ ] Decide imanagent runtime - match existing Hermes (Node? Python? Bun?)
- [ ] `infra/imanagent/` directory in repo:
  - `imanagent.service` - systemd unit
  - `deploy.sh` - rsync + systemctl restart
  - `agent/index.ts` (or .py) - main loop
  - `README.md` - setup steps
- [ ] Day-1 jobs (pick one or all):
  - **A.** Daily 9am post to Telegram channel: open items + blockers + KPIs
  - **B.** Telegram inbox watcher: msg starting `todo:` auto-creates item via API
  - **C.** Slash commands `/add /done /list /mine` in Telegram
- [ ] Audit log: every bot action -> `item_audit` row
- [ ] Health check endpoint - `imanagent` reports up/down to a status page

**Risk:** VPS perms. Use a non-root user. Restrict outbound to api.imanprojects.com only.

---

## Phase 5: Six Sigma metrics dashboard

**Why:** SIX-SIGMA.md says we measure - need the actual metrics visible.

**Work:**
- [ ] `/metrics` page - auth-gated
- [ ] KPIs:
  - Throughput (items moved to Done per week)
  - Cycle time histogram (median + p90)
  - Aging items (open > 14 days, sorted oldest first)
  - WIP count per owner
  - Items by category / phase / priority
- [ ] Weekly auto-summary email to both users (Friday 5pm)
- [ ] Trends - 8-week rolling chart
- [ ] Export CSV button

**Stack:** server-side queries on Supabase. Charts via lightweight lib (e.g. visx, or hand-rolled SVG).

---

## Phase 6: Power-user features

**Why:** as usage grows, we'll want these.

**Work:**
- [ ] Drag-and-drop status change (desktop only - native HTML5)
- [ ] Keyboard shortcuts: `n` new, `/` search, `1-4` filter status, `?` help
- [ ] Bulk actions: multi-select cards -> change owner / category / status / delete
- [ ] Subtasks / checklist per item
- [ ] Tags (free-form, in addition to fixed category)
- [ ] Attach links / files (Supabase Storage)
- [ ] Comment thread per item (notes timeline, not single field)
- [ ] @mentions in notes -> notification
- [ ] Saved filter views (e.g. "Iman's WIP P1")

---

## Phase 7: Public + community

**Why:** Once stable, expose what's appropriate to community.

**Work:**
- [ ] Public read-only view at `/public` - selected items only (toggle per item)
- [ ] POIDH bounty integration - bounty items show pot size, contributors
- [ ] Farcaster share buttons
- [ ] OG image generation (item card screenshots)
- [ ] RSS feed of done items

---

## Phase 8: Mobile + offline

**Why:** Iman likely mobile-primary. Make it feel native.

**Work:**
- [ ] PWA manifest + service worker
- [ ] Add to homescreen prompt
- [ ] Offline queue - edits while offline, sync when back
- [ ] Push notifications (web push) - "Iman set X to BLOCKED"

---

## Phase 9: Custom domain + branding

**Work:**
- [ ] Decide domain (e.g. `tracker.zao.fyi`, `imanprojects.zao.something`)
- [ ] Vercel domain config + DNS
- [ ] Branded login page (ZAO + Iman logo)
- [ ] Email-from setup if we add notifications

---

## Phase 10: ZAO OS port

**Why:** Original goal. Once stable + battle-tested, fold the tracker into ZAO OS as a native module.

**Work:**
- [ ] Map `items` schema to ZAO OS conventions
- [ ] Port UI components into ZAO OS shell
- [ ] Keep imanprojects as a fallback / public mirror
- [ ] Sync layer (or full migration cutover)

---

## Open questions to resolve before kicking each phase

**Phase 4 (imanagent) blockers:**
- Which Telegram chat / FC channel for daily post?
- Hermes existing repo + service file?
- VPS access mode - SSH script or paste-and-run?

**Phase 7 (public) blockers:**
- Which items can be public? Probably none of finance-related.
- POIDH bounty mechanics - on-chain attestations or off-chain?

**Phase 9 (domain) blockers:**
- Domain name decision.
