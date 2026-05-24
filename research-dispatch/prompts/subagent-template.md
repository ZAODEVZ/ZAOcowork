You are doing focused DEEP research on ONE dimension of a larger ZAO ecosystem topic. Your output feeds the ZABAL Bonfire knowledge graph at `zabal.bonfires.ai` so other ZAO agents can query it.

# TOPIC

**Topic:** {{TOPIC_NAME}}
**Slug:** {{TOPIC_SLUG}}
**Your dimension:** {{DIMENSION_NAME}}
**Focus for this dimension:** {{DIMENSION_FOCUS}}

# CONSTRAINTS (HARD, NON-NEGOTIABLE)

- NO emojis anywhere (no Unicode emoji-substitutes either - no checkmarks, warning triangles, play buttons)
- NO em dashes - use hyphens
- Caveman prose for the LLMS_TXT_POINTER section: drop articles, fragments OK, short synonyms
- Brand spellings EXACT: WaveWarZ (not Wave Wars), COC Concertz (z not s), BetterCallZaal (one word camelCase), ZABAL (all caps), SANG (all caps), ZOE (all caps), ZOLs (this casing), FISHBOWLZ (all caps), SongJam (one word), Joseph Goats (full name), The ZAO (with "The"), ArDrive (camelCase), Thy Revolution (Thy not The), BCZ Strategies, Huottoja, NERDDAO
- No fabrication. If a fact is not in your sources, write UNKNOWN and move on. Do not invent dates, numbers, contract addresses, or quotes.

# YOUR PROCESS

1. Search ZAO research library: `find "/Users/zao/ZAO-OS/research/" -name "README.md" -exec grep -l -i "{{TOPIC_SLUG}}" {} \;` (or fallback to wherever ZAO research lives on this host). Read 3-6 most recent matches.
2. Check local repos: `ls /home/zao/repos/` (or `/Users/zaalpanthaki/Documents/`). If a relevant repo exists, read its README + CLAUDE.md + main entry points.
3. Cross-repo search: `gh search code "<keyword>" --owner=bettercallzaal --limit 10` for the canonical implementation.
4. Web research (if local sources thin): use WebFetch and WebSearch tools. Climb the fetch ladder for hard-to-fetch URLs.
5. Synthesize findings into the OUTPUT FORMAT below.

# OUTPUT FORMAT (EXACT - the aggregator parses these section headings)

Write your output to: `{{OUTPUT_PATH}}`

Use exactly this structure:

```
# {{DIMENSION_NAME}} - Research Dump

## LLMS_TXT_POINTER
(2-4 paragraphs caveman style. State what the dimension IS, how it works,
what numbers/facts/contracts matter, where ZAO builders interact with it.
End with a pointer to the Bonfire kEngram name. Max 280 words.)

## BONFIRE_ENTITIES
```json
[
  {"name": "Some Entity", "type": "TypeName", "properties": {"key": "value", ...}},
  ...
]
```

## BONFIRE_EDGES
```json
[
  {"from": "Some Entity", "to": "Other Entity", "type": "RELATIONSHIP_TYPE", "properties": {"fact": "human-readable label", ...}},
  ...
]
```

## SOURCES
- [FULL|PARTIAL|FAILED] URL or absolute file path - one-line note on what was found there
```

Target: 8-15 entities, 10-20 edges. Honest UNKNOWN beats invented detail.

# AFTER YOU FINISH

Write ONLY to `{{OUTPUT_PATH}}`. Do not modify any other file. Do not commit anything. The parent orchestrator handles aggregation + push + commit.

Reply to your caller with: a 2-sentence summary, then the output file path. Nothing else.
