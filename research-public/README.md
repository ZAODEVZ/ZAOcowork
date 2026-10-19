# Public ZAO Research pages (thezao.xyz/research)

The research library (ZAODEVZ/ZAOresearch) is private. Some docs in it are
not public material. This folder holds the few docs Zaal has chosen to
publish, and only those are built into pages.

## How a doc becomes public

1. Add its id to `allowlist.json`. The id is `<topic>/<NNNN-slug>`, the
   folder path under `research/` in the library, for example
   `dev-workflows/1306-research-x-thread-action`. **Not listed means not
   public.** The list starts empty.
2. Sync it from a local clone of the library:
   `node scripts/sync-research.mjs <path-to-ZAOresearch-clone>`.
   This needs `gh` logged in, because GitHub's Markdown API renders the
   doc. It writes `docs/<id>.html` (the rendered body) and `docs/<id>.json`
   (title, number and the source commit). It drops YAML frontmatter, and
   it reads only allowlisted docs.
3. Open a PR with both changes. On merge, `npm run build` runs
   `scripts/research-pages.mjs`. That script writes
   `public/research/index.html` and one page per allowlisted doc, at
   `/research/<topic>/<NNNN-slug>`.

## Rules the build enforces

- Only ids in `allowlist.json` are built. A rendered copy in `docs/` that
  is not listed is never built. The build log names it as "not built".
- A listed doc with no rendered copy, or with a `.json` that is unreadable
  or has no title, is skipped with a warning. A missing, unparseable or
  wrongly shaped `allowlist.json` builds with no public docs and a warning.
  Either way the site build does not fail because of this folder.
- A relative link to another public doc goes to that doc's public page.
  Any other relative link, and any link into the private repo (on
  github.com or raw.githubusercontent.com), keeps its text but loses the
  link. Relative images and images hosted in the private repo are dropped,
  and their alt text stays.
- The pages are static files. They are excluded from the auth middleware
  (`research(?:/|$)` in the matcher) and served through rewrites in
  `next.config.mjs`, so a page view runs no function and no middleware.

## Taking a doc down

Remove its id from `allowlist.json`. The next deploy stops building its
page. Its rendered copy is still in this public repo's files until someone
deletes `docs/<id>.html` and `docs/<id>.json`. That deletion is Zaal's.
