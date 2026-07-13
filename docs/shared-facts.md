# Shared facts registry (candidate single source of truth)

This is a catalog, not a wired-in system yet. It exists so editing a shared
fact means updating one entry here and knowing every file that needs to
change - not re-discovering the list by grep each time. See the design
options under discussion (Option A: migrate to Next.js components with a
shared constants file, Option B: build-time templating from this data,
Option C: drift-detector lint only) before this becomes load-bearing.

## Governance / Respect stats

| Fact | Current value | Appears in |
|---|---|---|
| Weekly practice streak | 100+ unbroken weeks (as of July 2026) | paper.html, papers/the-zao-protocol.html, papers/what-is-the-zao.html, papers/drafts/history.html, papers/technical.html |
| OG Respect holder count | 122 holders (live-checked 2026-07-10) | llms.txt, papers/technical.html, papers/what-is-the-zao.html |
| Cumulative concentration | top 5 hold ~34%, top 10 hold ~53% | llms.txt, papers/technical.html, papers/what-is-the-zao.html |
| Per-round Fibonacci Gini | ~0.23 (doc 718b, internal-sourced, unconfirmed externally) | papers/technical.html, papers/what-is-the-zao.html |
| OG Respect contract | `0x34cE89baA7E4a4B00E17F7E4C0cb97105C216957` (Optimism) | papers/what-is-the-zao.html, papers/technical.html |
| ZOR Respect contract | `0x9885CCeEf7E8371Bf8d6f2413723D25917E7445c` (Optimism) | papers/technical.html |
| Voting veto window | 72 hour (corrected from an earlier 48h mismatch) | papers/technical.html |

## WaveWarZ / economics stats

| Fact | Current value | Appears in |
|---|---|---|
| Trader retention | 98.5% of every dollar traded stays in-ecosystem (98.5% trader retention + artist bonuses, 1.5% platform fee) | paper.html, papers/drafts/wavewarz.html |
| Spotify Loud & Clear 2025 | $11.3B paid to music industry, 13,800+ artists earned $100k+ | paper.html |

## Positioning phrases (looser - wording varies intentionally per page voice)

| Fact | Appears in (non-exhaustive) |
|---|---|
| "profit margin, data, and IP rights" / "profit, data, and artist rights" | paper.html, papers/what-is-the-zao.html, papers/technical.html (voice-varied since the 2026-07-12 Fable rewrite - NOT a candidate for strict token-substitution, this one should stay hand-written per page) |
| Zaal Panthaki / BetterCallZaal as founder | paper.html, papers/manifesto.html, papers/what-is-the-zao.html, papers/technical.html, papers/the-zao-protocol.html, papers.html |

## Notes

- Numeric/factual rows (holder counts, percentages, contract addresses, week counts, dates) are the real candidates for single-sourcing - these are what drifted and had to be hand-corrected multiple times this session (90+ weeks -> 100+ unbroken weeks needed fixing in 2 separate PRs before this catalog existed, because a third and fourth file with the same claim weren't caught in the first pass).
- Voice/phrasing rows are NOT good candidates for strict token substitution - papers are meant to read differently page to page (per the 2026-07-12 Fable rewrite), so forcing identical wording via a token would fight that goal. Only the underlying claim needs to be consistent, not the sentence.
- This file itself will go stale exactly like the HTML did unless one of the design options (A/B/C in the wake-up notes) gets picked and built. Treat it as a snapshot as of 2026-07-13, not a live source.
