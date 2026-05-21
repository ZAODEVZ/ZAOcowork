# imanprojects

Iman x Zaal action tracker. Kanban + Six Sigma-flavored. Next.js 15 + React 19, password login, edit-in-browser, persistent state via GitHub Contents API.

Live data lives in `data/actions.json`. Every save commits back to the repo, so the git history IS the audit log.

## Process docs

- **`SIX-SIGMA.md`** - the principles we use (DMAIC, 5S, TIMWOODS, weekly review)
- **`BACKLOG.md`** - everything queued for Phase 2+ (Supabase, bot API, VPS imanagent, ZAO OS port)

Read those before adding more features.

## Stack
- Next.js 15 (App Router) + React 19
- Tailwind v3
- Server actions + HMAC-signed cookie auth (no DB, no NextAuth)
- Persistence: GitHub Contents API write-back to `data/actions.json` (fallback to local FS in dev)

## Local dev
```bash
npm install
cp .env.example .env.local
# fill in ZAAL_PASSWORD, IMAN_PASSWORD, AUTH_SECRET
# (GITHUB_TOKEN optional locally - falls back to writing data/actions.json directly)
# (MINIMAX_API_KEY optional - without it the Assistant tab loads but send returns 503)
npm run dev
```

Open `http://localhost:3000` -> redirects to `/login`.

## Deploy to Vercel
1. Import this repo in Vercel.
2. Add env vars in Vercel project settings:
   - `ZAAL_PASSWORD` - Zaal's password
   - `IMAN_PASSWORD` - Iman's password
   - `AUTH_SECRET` - 32+ random hex chars (`openssl rand -hex 32`)
   - `GITHUB_TOKEN` - fine-grained PAT w/ `contents:write` on `bettercallzaal/imanprojects` (optional but needed for edits to persist on Vercel)
   - `GITHUB_REPO` - `bettercallzaal/imanprojects`
   - `GITHUB_BRANCH` - `main`
   - `MINIMAX_API_KEY` - MiniMax API key, powers the Assistant tab (optional - tab degrades to a 503 without it)
   - `MINIMAX_API_URL` / `MINIMAX_MODEL` - optional overrides, sane defaults baked in
3. Deploy. Each save in the app commits to `main`, which triggers a rebuild.

## Auth model
- Two passwords. One per user (Zaal, Iman). Set in env.
- Login sets HMAC-signed httpOnly cookie. 30-day expiry. No password reset flow - rotate via env var.
- Middleware checks cookie presence; server-side verifies signature.

## Data model
`data/actions.json`:
```json
{
  "updatedAt": "ISO timestamp",
  "items": [
    {
      "id": "1",
      "title": "...",
      "owner": "Zaal | Iman | Both",
      "status": "TODO | WIP | BLOCKED | DONE",
      "category": "ZAO Devz | WaveWarZ Zambia | Social | Site / Tech | Ops | Bounty | Other",
      "priority": "P1 | P2 | P3",
      "phase": "Define | Measure | Analyze | Improve | Control",
      "due": "free-form date or label",
      "notes": "...",
      "createdAt": "ISO",
      "updatedAt": "ISO"
    }
  ]
}
```

## UI features

- **Kanban board** - 4 status columns (TODO / WIP / BLOCKED / DONE). Mobile = column tabs.
- **Quick add** - one input per column, press Enter, item appears.
- **Inline edit** - click priority dot to cycle P1/P2/P3. Status dropdown on each card. "edit" opens full modal.
- **Filters** - search, mine-only, aging-only, owner, category, priority, DMAIC phase.
- **Stats bar** - open / my WIP / blocked / aging / done last 7 days.
- **Six Sigma signals** - aging badge (red after 14 days), cycle-time badge on Done items.
- **Help modal** - "?" button shows quick how-to + Six Sigma cheat.
- **AI Assistant** (`/chat`) - board-aware chat powered by MiniMax. Streams answers. The route handler injects a live snapshot of every item (status, owner, priority, age) into the system prompt, so you can ask "what's blocked?", "what should I work on?", "summarize Iman's WIP". Read-only - it tells you the change to make, it does not edit the board. API key is server-side only.

## Why GitHub-backed instead of DB
- Zero infra. No KV, no Postgres, no Supabase.
- Free on Vercel hobby tier.
- Audit log = git log.
- Tradeoff: ~30s deploy noise on save (page itself updates fast via revalidation).

Phase 2 in `BACKLOG.md` swaps to Supabase for instant + realtime + bot API.

## Migration path -> ZAO OS
Once Iman is comfortable, port the tracker into ZAO OS as a native module. Source-of-truth shifts from `data/actions.json` to ZAO OS DB. This app stays as a fallback. See `BACKLOG.md` Phase 10.
