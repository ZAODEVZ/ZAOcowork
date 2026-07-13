# Papers and photos - overview

This repo hosts two related but separate content systems, both public-facing
at thezao.xyz, alongside the internal team-ops board. This doc is the single
entry point tying together the six other docs about them - read this first,
then follow the links for the part you need.

## The ZAO papers (thezao.xyz/papers)

~20 static HTML pages under `public/` (whitepapers, the Manifesto, ecosystem
drafts, team profiles), served via `next.config.mjs` rewrites so each gets a
clean URL. These are content pages, not app routes - no React components,
just hand-written HTML with a shared dark-theme CSS block copy-pasted into
each file (this is a real, known drift risk - see `docs/shared-facts.md`
for the one place it's been solved so far, and note it as a bigger open
problem below).

Three systems layer on top of the static pages:

1. **`docs/shared-facts.md`** - a build-time templating system. 6 of these
   pages cite facts (a contract address, a holder count, the Fractal's
   week-count streak, WaveWarZ's retention rate) that used to drift out of
   sync across files when one got updated and others didn't. `data/facts.json`
   is now the single source; `templates/` holds the editable source for
   those 6 files; `scripts/apply-facts.mjs` regenerates `public/` from them
   as part of `npm run build`. **If you're editing one of those 6 pages,
   edit `templates/`, not `public/`** - see the doc for exactly which pages
   and why some numbers (rounded vs. exact percentages) were deliberately
   left un-templated.
2. **`docs/PAPER-EDITING.md`** - how anyone proposes an edit to any paper (a
   "Propose an edit (GitHub)" link in every page's footer, a PR template
   asking for a source on factual claims, and how contributor attribution
   works via each paper's "Editors" footer line).
3. **`scripts/check-paper-rewrites.mjs`** (+ its GitHub Actions workflow) -
   catches a real recurring bug class: a new paper added to
   `public/papers.json` without a matching `next.config.mjs` rewrite entry
   silently 404s in production with nothing catching it. Runs on every PR
   touching papers.

Two more sub-projects were researched but not built - `docs/MANIFESTO-SIGNING-RESEARCH.md`
(+ `docs/MANIFESTO-SIGNING-SETUP.md` for the concrete next steps, blocked on
Zaal provisioning WalletConnect credentials) and `docs/ZUKE-EDIT-PIPELINE-RESEARCH.md`
(blocked on the separate Zuke app having any live recording data yet).
`docs/COMMUNITY-EDITING-RESEARCH.md` is the design-decision doc behind #2 above.

**Known unsolved drift risk**: the shared-facts system only covers 6 of ~20
pages, and even those 6 still duplicate the entire CSS block and page shell
per file (only the fact *values* are templated, not the structure). A
change to the shared visual style today means hand-editing every page. Not
yet a problem worth solving - flagged here so it doesn't get rediscovered
from scratch later.

## Photos (thezao.xyz photo drops via Fotocaster)

A separate initiative, unrelated to the static papers pages above - this
one lives inside the actual Next.js app (`src/app/photos`, `src/lib/photos.ts`),
not `public/`.

- **Purpose**: Zaal has a large photo backlog and wants to sell them as $5
  one-of-one collectibles via Fotocaster (a third-party Farcaster photo app,
  photocaster.xyz by PinataCloud) - the collector of each 1/1 gets to ask
  one question, answered on a dedicated livestream.
- **What's built (sub-project 1 of 3)**: the `/photos` dashboard - upload,
  caption/credit/event/date/price metadata, a status lifecycle
  (`draft` -> `ready` -> `posted`), and manual logging fields for
  collector handle + their question + livestream scheduling. Posting to
  Fotocaster itself stays a manual action (no API integration exists or is
  planned) - the dashboard organizes and tracks around that manual step,
  it doesn't automate it.
- **Data**: `public.photos` table + a private `photos` Storage bucket, both
  in the **cowork** Supabase project (same one as `tasks`/`team_members` -
  this is board/ops data, not paper content, so it does NOT live in the
  Zuke project used by the papers RAG system).
- **Not yet built**: sub-project 2 (a public gallery page + embedding
  photos into the relevant papers) and sub-project 3 (triaging Zaal's
  existing backlog through the dashboard as its first real content).
- See `docs/superpowers/specs/2026-07-13-photo-dashboard-design.md` for the
  full design.

## Why these two systems are separate

The papers are public content maintained by (eventually) many contributors
through GitHub PRs, versioned like a document. Photos are an internal
team-ops workflow (upload, review, track) that happens to feed a public
Farcaster product - closer in shape to the CRM/meetings features than to
the papers. Don't conflate them: a future "add photos to the papers"
feature (sub-project 2 above) is the bridge between the two, not a merger.
