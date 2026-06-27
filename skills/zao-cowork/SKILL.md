---
name: zao-cowork
description: Read and update the ZAO Co-Works task board. Use when the user wants to list, create, update, or comment on tasks/work items on the ZAO board (thezao.xyz), check what's assigned to someone, mark tasks done, or triage work. Requires a ZAO bot token.
---

# ZAO Co-Works

Interact with the ZAO Co-Works board (`thezao.xyz`) over its bot API. Every
action is attributed to your bot token.

## Setup (one time)

You need two values, set as environment variables:

- `ZAO_API_URL` — base URL, e.g. `https://thezao.xyz`
- `ZAO_BOT_TOKEN` — a bot token (ask a ZAO admin to issue one)

All requests send `Authorization: Bearer $ZAO_BOT_TOKEN`.

> Prefer the MCP server (`mcp-server/`) if it's installed — it wraps all of this
> as native tools. Use the curl recipes below when MCP isn't available.

## Recipes

### List tasks

```bash
# All open tasks
curl -s "$ZAO_API_URL/api/v1/items" -H "Authorization: Bearer $ZAO_BOT_TOKEN"

# Filter: status, assignee (login slug), free-text search, limit
curl -s "$ZAO_API_URL/api/v1/items?status=WIP&assignee=thyrev&q=calendar&limit=20" \
  -H "Authorization: Bearer $ZAO_BOT_TOKEN"
```

Returns `{ ok, count, tasks: [{ id, title, status, priority, assignees, due, ... }] }`.

### Get one task (with comments)

```bash
curl -s "$ZAO_API_URL/api/v1/items/42" -H "Authorization: Bearer $ZAO_BOT_TOKEN"
```

### Create a task

```bash
curl -s -X POST "$ZAO_API_URL/api/v1/items" \
  -H "Authorization: Bearer $ZAO_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Ship calendar export","assignee":"thyrev","due_date":"2026-07-03","notes":"CSV + ICS"}'
```

`title` is required. Omit `assignee` to leave the task claimable. Returns `{ ok, id }`.

### Update a task

Only the fields you send change. Status accepts `TODO|WIP|BLOCKED|DONE`
(case-insensitive; `in_progress` is an alias for `WIP`).

```bash
curl -s -X PATCH "$ZAO_API_URL/api/v1/items/42" \
  -H "Authorization: Bearer $ZAO_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"DONE"}'
```

### Comment on a task

```bash
curl -s -X POST "$ZAO_API_URL/api/v1/items/42/comments" \
  -H "Authorization: Bearer $ZAO_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"PR merged, closing this out."}'
```

## Conventions

- **Task ids** are plain numbers (the `#N` you see in the UI).
- **Assignees** are lowercase login slugs (`zaal`, `iman`, `thyrev`, …), not
  display names.
- **Status** values: `TODO`, `WIP`, `BLOCKED`, `DONE`.
- **Rate limits:** writes 60/min, reads 120/min per token. On `429` the response
  includes `retryAfterSeconds` — wait, then retry.
- Every response is `{ ok: true, ... }` or `{ ok: false, error: "..." }`.

## Tips for the agent

- Before creating a task, `list_tasks` with a `q=` search to avoid duplicates.
- When the user says "mark X done", find the task first (`list_tasks q=...`),
  confirm the id, then PATCH it.
- Leave a comment when you change status so humans have context.
