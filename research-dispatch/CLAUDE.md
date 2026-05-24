# CLAUDE.md - research-dispatch

## What This Is

VPS-side autonomous research pipeline. Sibling of `../agent/` (ZAOcoworkingBot) inside `ZAODEVZ/ZAOcowork`. Spawns parallel Claude Code subagents on a topic, normalizes their output into Bonfire-graph entities/edges, pushes to the live Bonfire knowledge graph at `zabal.bonfires.ai`, and commits the result back to the source-of-truth repo (`ZAODEVZ/zabalgames`).

Triggers:
- Telegram command `/research <slug>` or `/research next` (wire into the existing `../agent/` bot or any grammy/telegraf bot)
- Cron Sundays 9pm UTC picks next pending queue item

## Constraints (HARD - apply to every file in this dir and every subagent prompt)

- NO emojis anywhere
- NO em dashes (use hyphens)
- Brand spellings exact: WaveWarZ, COC Concertz, BetterCallZaal, ZABAL, SANG, ZOE, ZOLs, FISHBOWLZ, SongJam, Joseph Goats, The ZAO, ArDrive, Thy Revolution, BCZ Strategies, Huottoja, NERDDAO
- No fabrication. Subagents that cannot find a fact must write UNKNOWN

## How It Works

1. `scripts/run-dispatch.mjs <slug>` reads `data/research-queue.json`, finds the matching topic, generates 5-8 subagent prompts from the topic's `dimensions` array
2. Spawns parallel `claude` CLI subprocesses, one per dimension. Each subagent writes to `/tmp/zabal-dispatch-<slug>-<YYYYMMDD>.md` in the standard report schema
3. Waits for all subagents (with a timeout). Aggregates with `scripts/aggregate-dispatches.mjs` into the local zabalgames repo clone's `data/bonfire-graph.json`
4. Pushes to live Bonfire via `scripts/push-to-bonfire.mjs` (POST to `tnt-v2.api.bonfires.ai`)
5. Commits + pushes the updated `data/bonfire-graph.json` and `llms.txt` (with new kEngram pointer row) back to `ZAODEVZ/zabalgames` via `gh` CLI
6. Marks the queue item `done` in `data/research-queue.json`. Commits + pushes back to `ZAODEVZ/ZAOcowork`

## Repo Layout (within this subdir)

- `scripts/run-dispatch.mjs` - the orchestrator
- `scripts/aggregate-dispatches.mjs` - normalizer (entity name -> slug id, type -> labels, dedup)
- `scripts/push-to-bonfire.mjs` - HTTP pusher to Bonfire
- `prompts/subagent-template.md` - the standard subagent prompt template (read by run-dispatch and interpolated per topic + dimension)
- `data/research-queue.json` - the queue of pending topics
- `bot/telegram-research-command.mjs` - drop-in handler for any Telegram bot
- `cron/sunday-research.sh` - cron wrapper

## Required Env Vars (on VPS)

| Var | Purpose |
|---|---|
| `BONFIRE_API_KEY` | Bearer token for tnt-v2.api.bonfires.ai |
| `BONFIRE_ID` | Defaults to `69ef871f0d22ed7e6f2b243a` (the ZABAL bonfire) |
| `ZABALGAMES_REPO_PATH` | Absolute path to the zabalgames clone on the VPS (e.g. `/home/zao/repos/zabalgames`) |
| `RESEARCH_DISPATCH_DIR` | Absolute path to this dir (e.g. `/home/zao/repos/ZAOcowork/research-dispatch`) |
| `GH_TOKEN` | GitHub PAT with `repo` scope (so the dispatch can commit + push to both repos) |
| `CLAUDE_CODE_BIN` | Path to claude CLI binary (defaults to `claude`) |
| `TELEGRAM_BOT_TOKEN` | Only for the bot integration (not the dispatch itself) |
| `TELEGRAM_NOTIFY_CHAT_ID` | Channel/chat to post dispatch progress + results |

## Relationship to the rest of ZAOcowork

This module writes to TWO external places:
- **`ZAODEVZ/zabalgames`** - the graph file `data/bonfire-graph.json` (source of truth for the Bonfire knowledge graph)
- **This dir's own `data/research-queue.json`** - marks topics done

It never modifies the action-tracker Next.js app at the repo root or the `agent/` sibling. It only READS the queue file in this subdir and WRITES out to the two locations above.

## Don't confuse with

- `../agent/` is ZAOcoworkingBot - the Telegram concierge for the action tracker, totally separate purpose
- The root Next.js app is the action-tracker kanban (Iman x Zaal). Also separate.
