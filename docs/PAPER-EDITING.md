# Community editing (sub-project 2 of the ZAO Paperz platform)

How anyone can propose a change to a ZAO paper, and how contributors get
credited. This is the v1 of community editing - a GitHub-PR-based flow,
chosen over a database-driven proposal queue because it needed zero new
infrastructure and reuses review tooling that already exists (see
`docs/COMMUNITY-EDITING-RESEARCH.md` for the two options that were
weighed).

## How to propose an edit

Every paper page has a **"Propose an edit (GitHub)"** link in its footer.
Clicking it opens GitHub's in-browser editor directly on the file behind
that page - no local clone needed for a small wording or fact fix.

1. Click "Propose an edit (GitHub)" on the paper you want to change.
2. Make your edit in GitHub's editor.
3. Commit to a new branch and open a pull request. When you do, pick the
   **"paper-edit"** PR template from GitHub's template chooser (or go
   directly to `.../compare/main...your-branch?template=paper-edit.md`) -
   it asks for a source on any factual claim and how you'd like to be
   credited.
4. A maintainer reviews and merges. Once merged, you're added to that
   paper's "Editors" line in its footer.

## Which file to actually edit

Some papers have numbers (contract addresses, holder counts, the week-count
streak) that are shared across multiple papers and single-sourced via
`data/facts.json` + `templates/` (see `docs/shared-facts.md`). For those 6
papers, the "Propose an edit" link points at the file under `templates/`,
not `public/` - that's correct, don't be surprised if the link doesn't go
to `public/`. Editing the template is exactly right; the build regenerates
the live page from it automatically.

Every other paper has no template - the "Propose an edit" link points
straight at its `public/` file, which is also correct for those.

## What a good PR looks like

- **Cite your source.** Any new or changed number, date, or quote needs a
  source someone else could check - a link, a doc, an on-chain address.
  This project has been burned before by unsourced claims drifting into
  multiple papers (see `docs/superpowers/` session history) - a PR without
  a source for a factual change will get asked for one before merge.
- **Match the paper's existing voice.** Papers were deliberately given
  distinct voices in a 2026-07-12 rewrite pass - don't homogenize wording
  across papers unless that's specifically what your PR is about.
- **Small and focused.** A PR that fixes one fact or clarifies one section
  reviews faster than one that rewrites a whole page.

## Attribution

Each paper's footer has an "Editors." line crediting whoever's feedback or
edits got incorporated (see the Whitepaper's footer for the existing
example - Jose Cabrera is credited there). When your PR merges, the
maintainer adds your name/handle (as given in the PR template) to that
paper's Editors line, if it isn't already listed.

## Open question, deferred (see docs/COMMUNITY-EDITING-RESEARCH.md)

This v1 doesn't gate who can open a PR - GitHub's own permission model (a
fork + PR from anyone) is the gate. Whether ZAO wants to require signing
the Manifesto (sub-project 4) before someone can propose an edit is a
follow-up decision, not part of this v1.
