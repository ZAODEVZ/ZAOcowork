# Community editing + attribution - research prep (not a design, not built)

Sub-project 2 of the ZAO Paperz platform. This is research prep for a future
brainstorming conversation, not a design decision or a build - it documents
what already exists (both in the database and in current informal practice)
so that conversation starts from facts, not a blank page.

## What already exists

**Database**: `public.paper_edits` (Zuke Supabase project, created as an
empty shell during the RAG foundation build, sub-project 1) currently has
only `id`, `paper_id`, `section_id`, `created_at` - foreign-keyed to
`paper_sections`. No contributor identity field, no diff/content field, no
review-status field. It's a placeholder, not a usable schema yet.

**Informal practice, already live in production**:
- Every core paper (Whitepaper, Technical Whitepaper, the-zao-protocol) has
  an "Editors." credit line in its footer - currently just "Jose Cabrera" on
  the Whitepaper's roadmap-gap section, added by hand when his feedback got
  incorporated.
- Every paper now links to a real Google Doc ("Comment on this draft") where
  readers leave inline comments - a human (Zaal, or whoever manages the
  paper) reads the comments and manually edits the live HTML to incorporate
  them, then (inconsistently, so far) credits the commenter in the Editors
  line.
- This session's shared-facts system (docs/shared-facts.md) means edits to
  the 7 templated papers now go through `templates/`, not `public/` directly
  - relevant since any future editing UI needs to know which of the two it's
  writing to.

So today's actual workflow is: comment on Google Doc -> human reads it ->
human edits HTML by hand -> human adds a credit line, inconsistently. That's
the baseline sub-project 2 would replace or formalize.

## Two shapes a real design could take (not a decision - a menu for the brainstorm)

**A. GitHub-PR-based.** A contributor (or a bot acting for them) opens a PR
against a paper's `templates/` file (or `public/` file, for the ~13 papers
without shared facts). Existing GitHub review tooling handles approval;
attribution is just `git log`/PR author, already free. Closest to zero new
infrastructure - largely formalizes what a build agent already does inside
a Claude Code session tonight. Downside: real friction for a non-technical
community member who isn't comfortable with GitHub.

**B. Database-driven proposal queue.** A contributor submits an edit
through a form or a ZAOpaperzBOT command; it lands in `paper_edits` (which
would need real columns added: proposer identity, the actual diff or new
content, a status enum, a reviewer). An admin/reviewer approves in a queue
UI, which then writes to `templates/`/`public/` (possibly via the exact
`apply-facts.mjs`-style regenerate pattern this session built for shared
facts, generalized to full-section content instead of just tokens).
Downside: real engineering lift - a review UI, auth for who can propose,
and a merge-back mechanism from DB to file.

**Open question for the brainstorm**: who can propose an edit at all? Public
internet, or gated to people who've signed the Manifesto (sub-project 4) -
i.e. does sub-project 2 depend on sub-project 4 shipping first, or can it
launch without a gate and add one later?

## Sources / basis

- Live schema check via `mcp__supabase__list_tables` against the Zuke
  project (`yhpszfepoerqgnewukkh`), 2026-07-13.
- `public/paper.html`'s existing "Editors." line and the Google Doc links
  added in this session's PR #192 - both read directly from the live repo.
