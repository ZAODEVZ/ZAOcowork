# ZAO Co-Works MCP server

Let any Claude — Desktop, Code, or the Agent SDK — read and update the
[ZAO Co-Works](https://thezao.xyz) board through MCP tools.

It's a thin client over the public bot API (`/api/v1/*`). You authenticate with
a single **bot token**; every action you take is attributed to that bot.

## Tools

| Tool | What it does |
|------|--------------|
| `list_tasks` | List tasks, filter by `status`, `assignee`, or search `q` |
| `get_task` | Get one task by id, with its comments |
| `create_task` | Create a task (`title` required) |
| `update_task` | Change `status` / `assignee` / `due_date` / `notes` |
| `comment_task` | Leave a comment on a task |

## Setup

You need two things:

1. **`ZAO_API_URL`** — the deployment base URL, e.g. `https://thezao.xyz`
2. **`ZAO_BOT_TOKEN`** — ask a ZAO admin to issue you one (it goes in the
   `COWORK_BOT_TOKENS` env or the `bot_tokens` table)

### Install

```bash
cd mcp-server
npm install
```

### Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json`, or `.mcp.json` for Claude
Code):

```json
{
  "mcpServers": {
    "zao-cowork": {
      "command": "node",
      "args": ["/absolute/path/to/ZAOcowork/mcp-server/index.mjs"],
      "env": {
        "ZAO_API_URL": "https://thezao.xyz",
        "ZAO_BOT_TOKEN": "tok_your_token_here"
      }
    }
  }
}
```

Restart Claude. You should now be able to say things like:

> "What's on my plate in ZAO Co-Works?"
> "Create a task: ship the calendar export, assign it to thyrev, due Friday."
> "Mark task 42 done and comment that the PR merged."

## Notes

- **Rate limits:** writes are capped at 60/min per token, reads at 120/min.
- **Attribution:** everything you create or change shows up on the board as
  done by your bot name, with an activity-log entry.
- This is the same API the internal bot fleet uses — see `docs/BOT-API.md` for
  the raw HTTP reference.
