# research-dispatch

VPS-side autonomous research pipeline. Sibling of `agent/` inside `ZAODEVZ/ZAOcowork`. Fans out parallel Claude Code subagents on research topics, normalizes their findings into Bonfire knowledge-graph entities + edges, pushes to live Bonfire at `zabal.bonfires.ai`, and commits the updated graph back to `ZAODEVZ/zabalgames`.

Triggered by:
- Telegram `/research <slug>` or `/research next` (wire `bot/telegram-research-command.mjs` into ZAOcoworkingBot or any grammy/telegraf bot)
- Cron Sundays 9pm UTC (picks next pending topic from the queue)

## Why this is its own subdir

The `agent/` sibling is the Telegram concierge for the action tracker (grammy + Letta memory + 9 slash commands). This module is a different shape - cron-driven + on-demand orchestrator that spawns parallel Claude CLI subprocesses. Same VPS, same Claude Max plan auth, different lifecycle. Kept separate so neither blocks the other.

## Architecture

```
data/research-queue.json
        |
        v
scripts/run-dispatch.mjs --slug X
        |
        +--> spawns N parallel `claude` CLI subprocesses (one per dimension)
        |        |
        |        v
        |    each writes /tmp/zabal-dispatch-<slug>-<dim>-<date>.md
        |
        +--> scripts/aggregate-dispatches.mjs  (normalize + dedup into bonfire-graph.json)
        |
        +--> scripts/push-to-bonfire.mjs  (POST to tnt-v2.api.bonfires.ai)
        |
        +--> git commit + push (to ZABALGAMES_REPO_PATH on disk)
        |
        +--> mark queue item done, commit + push (to ZAOcowork parent repo)
        |
        +--> Telegram notify (start + done)
```

## Install (on VPS)

```bash
# As the user that the cron + bot will run under (typically `zao`)
curl -fsSL https://raw.githubusercontent.com/ZAODEVZ/ZAOcowork/main/research-dispatch/setup.sh | bash

# Or clone first then run:
git clone https://github.com/ZAODEVZ/ZAOcowork.git ~/repos/ZAOcowork
cd ~/repos/ZAOcowork/research-dispatch
./setup.sh
```

Then edit `~/.research-dispatch.env` to fill in:
- `BONFIRE_API_KEY` (from `app.bonfires.ai` dashboard)
- `GH_TOKEN` (GitHub PAT with `repo` scope - the pipeline pushes to both ZAOcowork and zabalgames)
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_NOTIFY_CHAT_ID` (optional but recommended)

## Use

### Manual one-off

```bash
cd ~/repos/ZAOcowork/research-dispatch
RESEARCH_DISPATCH_DIR=$(pwd) node scripts/run-dispatch.mjs --slug hats-protocol      # specific topic
RESEARCH_DISPATCH_DIR=$(pwd) node scripts/run-dispatch.mjs --next                    # first pending in queue
RESEARCH_DISPATCH_DIR=$(pwd) node scripts/run-dispatch.mjs --slug X --dry            # show prompts, do not spawn
```

### Telegram trigger

`bot/telegram-research-command.mjs` is a framework-agnostic handler. Wire into ZAOcoworkingBot (the existing grammy bot in `../agent/`) or any other bot:

```js
// in ZAOcowork/agent/src/index.ts or wherever your bot is composed:
import handleResearchCommand from '../../research-dispatch/bot/telegram-research-command.mjs';

bot.command('research', async (ctx) => {
  await handleResearchCommand({
    args: (ctx.match || '').split(/\s+/).filter(Boolean),
    reply: (text) => ctx.reply(text, { parse_mode: 'Markdown' }),
    allowedChatIds: [process.env.ZAO_DEVZ_CHAT_ID],
    chatId: ctx.chat.id,
  });
});
```

Then in Telegram:

```
/research queue                # list all topics with status
/research next                 # run first pending
/research <slug>               # run specific topic
/research <slug> --force       # rerun a done topic
/research status               # currently-running dispatches
```

### Cron (weekly)

```bash
crontab -e
# Add:
0 21 * * 0 /home/zao/repos/ZAOcowork/research-dispatch/cron/sunday-research.sh >> /var/log/research-dispatch-cron.log 2>&1
```

This runs every Sunday 9pm UTC. Adjust for your timezone with `TZ=America/New_York` prefix if needed.

## Add a topic to the queue

Edit `data/research-queue.json`:

```json
{
  "slug": "your-topic-slug",
  "name": "Human-readable name",
  "status": "pending",
  "added": "2026-05-24",
  "dimensions": [
    { "slug": "dim-one", "name": "Dimension One", "focus": "Specific question this subagent owns" },
    { "slug": "dim-two", "name": "Dimension Two", "focus": "..." }
  ]
}
```

Commit + push to `ZAODEVZ/ZAOcowork`. The next cron run (or `--next` invocation) will pick it up.

## What gets committed where

| Repo | What | When |
|---|---|---|
| `ZAODEVZ/zabalgames` | `data/bonfire-graph.json` (graph file) | After every successful dispatch |
| `ZAODEVZ/ZAOcowork` | `research-dispatch/data/research-queue.json` (queue with `done` status) | After every successful dispatch |

The pipeline never modifies `zabalgames/llms.txt` automatically - that file's kEngram pointer table needs a human's eye to write the one-line takeaway per topic. Add the row by hand after the graph push.

## Files

- `scripts/run-dispatch.mjs` - the orchestrator (spawns subagents, calls aggregate + push, commits)
- `scripts/aggregate-dispatches.mjs` - normalizes `/tmp/zabal-dispatch-*.md` into `bonfire-graph.json` schema
- `scripts/push-to-bonfire.mjs` - HTTP pusher to `tnt-v2.api.bonfires.ai`
- `prompts/subagent-template.md` - the standard subagent prompt (interpolated per topic + dimension)
- `data/research-queue.json` - the queue of pending topics (currently 8 topics x ~4 dimensions each)
- `bot/telegram-research-command.mjs` - drop-in handler for ZAOcoworkingBot or any Telegram bot
- `cron/sunday-research.sh` - cron wrapper
- `setup.sh` - one-shot VPS install
- `.env.example` - required env vars (copy to `~/.research-dispatch.env`)
- `CLAUDE.md` - constraints + brand rules (read by AI agents working on this dir)

## Constraints (apply to every file in this dir + every subagent output)

- No emojis
- No em dashes (use hyphens)
- Brand spellings exact: WaveWarZ, COC Concertz, BetterCallZaal, ZABAL, SANG, ZOE, ZOLs, FISHBOWLZ, SongJam, Joseph Goats, The ZAO, ArDrive, Thy Revolution, BCZ Strategies, NERDDAO
- No fabrication. Subagents that cannot find a fact write UNKNOWN.

## Known limitations

1. **Push-script 409 handler uses local slug.** If a Bonfire entity already exists from a prior manual load, edges to it will fail until we add a `/kg/entities?name=X` lookup that returns the real UUID.
2. **No per-subagent retry.** A timed-out subagent loses its slot. The aggregator just works with whatever landed. Re-run the topic with `--force` to retry.
3. **llms.txt pointer table is manual.** The pipeline grows the graph autonomously but the one-line summary row in `zabalgames/llms.txt` is human-added.
4. **No concurrency guard.** Two dispatches on the same topic at the same time will collide. The bot's in-process running-set prevents accidental dupes within one process; nothing prevents cron + manual run racing.
