# Shared facts - single source of truth

Some numbers repeat across multiple ZAO papers (the Fractal's week-count streak,
the OG Respect contract address, the WaveWarZ retention rate, etc). Before
this system existed, changing one of these meant grepping for every file that
mentioned it and hand-editing each one - which is exactly how this session's
"90+ weeks" -> "100+ unbroken weeks" fix needed two separate follow-up PRs
before every occurrence was found.

Now these facts live in one place and get substituted into the built pages
automatically.

## How it works

- `data/facts.json` - the source of truth. Each entry has a `value`, a
  `description`, and a `lastVerified` date.
- `templates/` - mirrors the structure of `public/`, but for any page that
  cites a shared fact, contains a `{{TOKEN_NAME}}` placeholder instead of the
  literal value.
- `scripts/apply-facts.mjs` - reads `data/facts.json` and every file under
  `templates/`, substitutes tokens, and writes the result to the matching
  path under `public/`. Throws if a template references a token that isn't
  in `facts.json` (typo protection). Warns if a fact in `facts.json` is never
  referenced by any template (dead-fact protection).
- Wired into `npm run build` (`"build": "node scripts/apply-facts.mjs && next build"`),
  so every deploy regenerates `public/` from the templates before Next.js builds.

## Editing a shared fact

1. Edit the `value` in `data/facts.json` (and update `lastVerified`).
2. Run `npm run facts:apply`.
3. Commit both `data/facts.json` and the regenerated files under `public/`.

Every page using that token updates in the same commit - no more per-file
hunting.

## Editing a page that has shared facts

If a page appears in `templates/`, edit the file in `templates/`, not the
one in `public/` - `public/` for that page is now generated output and will
be silently overwritten the next time `npm run build` or `npm run
facts:apply` runs. Then run `npm run facts:apply` to regenerate `public/`
and commit both.

Pages NOT listed below don't have shared facts and are still edited directly
in `public/` as before - there was no reason to move ~20 files into
`templates/` when only a handful actually cite a fact that repeats
elsewhere.

Run `npm run facts:check` (no writes, exits non-zero on drift) to verify
every generated file in `public/` still matches its template + facts.json -
useful before opening a PR if you're not sure whether you edited the
template or the generated file by mistake.

## Currently tokenized facts

| Token | Current value | Description |
|---|---|---|
| `WEEK_COUNT` | 100+ | The Fractal's unbroken-weeks streak number. Each page keeps its own surrounding phrasing ("100+ unbroken weeks", "100+ weeks", "over 100+ weeks") - only the numeral is shared. |
| `OG_RESPECT_CONTRACT` | `0x34cE89baA7E4a4B00E17F7E4C0cb97105C216957` | OG Respect (ERC-20) contract address on Optimism. |
| `ZOR_RESPECT_CONTRACT` | `0x9885CCeEf7E8371Bf8d6f2413723D25917E7445c` | ZOR Respect (ERC-1155) contract address on Optimism. |
| `OG_HOLDER_COUNT` | 122 | Live OG Respect holder count. |
| `OG_HOLDER_ASOF_DATE` | 2026-07-10 | The date `OG_HOLDER_COUNT` was last live-checked. |
| `WAVEWARZ_RETENTION_PCT` | 98.5 | Percent of every WaveWarZ dollar traded that stays in the ecosystem. |

## Templated files

`templates/paper.html`, `templates/papers/what-is-the-zao.html`,
`templates/papers/technical.html`, `templates/papers/the-zao-protocol.html`,
`templates/papers/drafts/history.html`, `templates/papers/drafts/wavewarz.html`,
`templates/llms.txt` - generate the corresponding files under `public/`.

## Deliberately NOT tokenized yet

- **Top-5/top-10 holder concentration percentages** (`~34%`/`~53%` vs the more
  precise `~34.49%`/`~53.21%`) - the rounded and exact versions are
  intentionally different precision for different audiences (the short
  what-is-the-zao page rounds, the Technical Whitepaper is exact). Forcing
  these to one token would erase that intentional distinction. If the
  underlying on-chain numbers are re-checked, both versions need independent
  updating for now.
- **Gini coefficients** (`~0.23` per-round, `~0.73` cumulative) - same
  precision-by-audience reasoning, and these are explicitly flagged
  internal-sourced/unconfirmed in several citations, so mechanically syncing
  them across pages could misrepresent verification status.
- **The 72-hour voting/veto window** - currently only duplicated within
  `technical.html` itself (not across multiple papers), so there's no
  cross-file drift risk yet. Candidate for tokenizing if it starts appearing
  in other papers.
- **Positioning phrases** like "profit margin, data, and IP rights" - these
  are meant to read differently page to page (the 2026-07-12 Fable rewrite
  deliberately varied this wording for voice), so only the underlying claim
  needs to stay consistent, not the sentence. Not a candidate for token
  substitution.
- **One paragraph in `technical.html`** (the "Research-sourced, VERIFY before
  publishing" disclaimer) mentions "100+ unbroken weeks" but as commentary
  about which figures still need re-verification, not as an assertion of the
  fact - left as plain text on purpose.

## Extending this

To add a new shared fact: add an entry to `data/facts.json`, replace the
literal value with `{{YOUR_TOKEN}}` in every template file that cites it (add
the file to `templates/` first if it isn't there yet - copy it from
`public/`, keeping everything else byte-identical), then run `npm run
facts:apply` and verify the generated `public/` output only changed where
you intended (`git diff public/` should show exactly the fact you touched,
nothing else).
