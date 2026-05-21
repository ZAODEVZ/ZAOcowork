# ZAOcoworkingBot v2 agent

Telegram concierge for cowork-zaodevz. Reads + writes `data/actions.json` via GitHub Contents API, persists conversation history, surfaces action item context on every reply.

Per spec: [ZAOOS doc 662](https://github.com/bettercallzaal/ZAOOS/tree/main/research/dev-workflows/662-zaocoworking-v2-v3-architecture).

## What it does

| Layer | What |
|---|---|
| Brain | spawns `claude --print --model haiku` per message (Hermes pattern, Max plan OAuth) |
| Memory | 5-block Letta-style: persona / human / working (last 20 turns) / tasks / actions (live snapshot of `data/actions.json`) |
| Transcripts | every in/out message persisted to `~/.zaocoworking/archive/<scope>/<yyyy-mm>.jsonl` (append-only) + `~/.zaocoworking/recent/<scope>.json` (ring buffer) |
| Mutations | 9 slash commands write to `data/actions.json` via Octokit with SHA-dance retry (3 attempts, exponential backoff) |
| Conversational | when the LLM proposes a mutation in a ```json-suggest fence, bot asks "reply yes to confirm" before writing |

## Slash commands

```
tracker:
  /start                       - help
  /mine                        - my open items
  /list [category]             - all open items by owner
  /add <title>                 - create item (owner = me, status = TODO)
  /wip <id>                    - move to in-progress
  /blocked <id> <reason>       - mark blocked
  /done <id>                   - mark done
  /assign <id> <Owner>         - reassign to Zaal|Iman|Both|ThyRev|Samantha|Open
  /daily                       - admin: post open-items digest

model / BYOK (v2.5):
  /providers                   - list claude-max | claude-api | openai | minimax
  /mymodel                     - show my current provider/model + key source
  /setmodel <provider> <model> - switch (per-user, persisted)
  /setkey <provider> <key>     - DM only; bring-your-own-key
  /clearkey <provider>         - drop my key, fall back to env
```

### Default provider

`claude-max` (local Claude CLI subprocess, Max plan OAuth, $0 marginal cost). Set `DEFAULT_LLM_PROVIDER` + `DEFAULT_LLM_MODEL` in `.env` to change the global default.

### BYOK security

- `/setkey` is **DM-only** - bot refuses keys in group chats
- Bot deletes the user's key message from Telegram history after saving (best-effort, requires bot delete permission)
- Per-user file at `~/.zaocoworking/users/<tg_id>.json` chmod 600
- No encryption at rest in v2.5 - relies on file perms + root-only access. Encrypt in v3 if needed.

## Filesystem (`~/.zaocoworking/`)

```
persona.md              bot voice + identity (hand-edit, never overwritten)
human.md                the 4 team members + roles
tasks.json              bot-internal task queue
actions.json            cached snapshot of repo's data/actions.json
actions-sha.txt         last-known SHA for Octokit writes
recent/<scope>.json     ring buffer (20 turns)
archive/<scope>/<yyyy-mm>.jsonl   permanent transcript
sentinels/              cron idempotency markers
pending-suggestion.json the one in-flight LLM suggestion awaiting yes/no
```

`<scope>` = `private` for DMs, or stringified Telegram chat_id for groups.

## Env (`agent/.env`, chmod 600)

```
TELEGRAM_BOT_TOKEN=<botfather token>
ALLOWLIST_USER_IDS=1447437687,IMAN_TG_ID,THYREV_TG_ID,SAMANTHA_TG_ID
ALLOWLIST_CHAT_IDS=-1003953353016
USER_NAMES=1447437687:Zaal,IMAN_TG_ID:Iman,THYREV_TG_ID:ThyRev,SAMANTHA_TG_ID:Samantha
ADMIN_USER_IDS=1447437687
GITHUB_TOKEN=<fine-grained PAT for songchaindao-dot/cowork-zaodevz Contents R/W>
```

Optional:
```
COWORK_HOME=/root/.zaocoworking
BOT_MODEL=haiku
GITHUB_REPO=songchaindao-dot/cowork-zaodevz
GITHUB_BRANCH=main
```

## Deploy

Assumes node 22 + `~/bin/claude` + `~/bin/gh` already installed on VPS (see [ZAOOS doc 662 Section A](https://github.com/bettercallzaal/ZAOOS/tree/main/research/dev-workflows/662-zaocoworking-v2-v3-architecture#section-a---current-state-v1-shipped-2026-05-17)).

```bash
cd ~
git clone https://github.com/songchaindao-dot/cowork-zaodevz.git  # if not already
cd cowork-zaodevz/agent
npm install
cp .env.example .env
# edit .env, fill the secrets
chmod 600 .env

mkdir -p ~/.config/systemd/user
cp systemd/zaocoworking-bot.service ~/.config/systemd/user/
loginctl enable-linger $(whoami)
systemctl --user daemon-reload
systemctl --user enable --now zaocoworking-bot.service
systemctl --user is-active zaocoworking-bot.service
journalctl --user -u zaocoworking-bot.service -f
```

## Update (post-deploy)

```bash
cd ~/cowork-zaodevz
git pull
cd agent
npm install
systemctl --user restart zaocoworking-bot.service
```

## Ops cheat

```bash
journalctl --user -u zaocoworking-bot.service -f          # tail logs
systemctl --user restart zaocoworking-bot.service          # pick up code or .env
systemctl --user status zaocoworking-bot.service           # health

# Add a user
nano agent/.env  # append to ALLOWLIST_USER_IDS= and USER_NAMES=
systemctl --user restart zaocoworking-bot.service

# Add a group
# 1. @mention the bot in the new group
# 2. Grep journal for the "drop" log line to find chat ID
# 3. Append to ALLOWLIST_CHAT_IDS=, restart

# Hand-edit the persona
nano ~/.zaocoworking/persona.md
systemctl --user restart zaocoworking-bot.service
```

## v3 (deferred)

Hermes-pattern code-on-repo (bot opens PRs from conversations). See [ZAOOS doc 662 Section C](https://github.com/bettercallzaal/ZAOOS/tree/main/research/dev-workflows/662-zaocoworking-v2-v3-architecture#section-c---v3-architecture-next-pr-after-v2-stabilizes). Defer until v2 soaks 24-48h.
