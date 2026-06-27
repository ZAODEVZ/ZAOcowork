#!/usr/bin/env node
// ZAO Co-Works MCP server.
//
// Exposes the cowork board as MCP tools so any Claude (Desktop, Code, or the
// Agent SDK) can read and update tasks. It is a thin client over the public
// bot API (/api/v1/*) — all auth is a single bot token, all writes are
// attributed to that bot.
//
// Config via env:
//   ZAO_API_URL    base URL of the deployment   (e.g. https://thezao.xyz)
//   ZAO_BOT_TOKEN  a bot token from COWORK_BOT_TOKENS / bot_tokens table
//
// Run:  ZAO_API_URL=… ZAO_BOT_TOKEN=… node index.mjs

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_URL = (process.env.ZAO_API_URL || "").replace(/\/$/, "");
const BOT_TOKEN = process.env.ZAO_BOT_TOKEN || "";

if (!API_URL || !BOT_TOKEN) {
  console.error(
    "[zao-cowork-mcp] Missing config. Set ZAO_API_URL and ZAO_BOT_TOKEN.",
  );
  process.exit(1);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${BOT_TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = { ok: false, error: `non-JSON response (HTTP ${res.status})` };
  }
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `request failed (HTTP ${res.status})`);
  }
  return json;
}

const TOOLS = [
  {
    name: "list_tasks",
    description:
      "List tasks on the ZAO Co-Works board. Filter by status (TODO/WIP/BLOCKED/DONE), assignee (login slug), or a search query.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "TODO | WIP | BLOCKED | DONE" },
        assignee: { type: "string", description: "login slug, e.g. 'zaal'" },
        q: { type: "string", description: "search in title/notes" },
        limit: { type: "number", description: "max results (default 100, max 500)" },
      },
    },
  },
  {
    name: "get_task",
    description: "Get one task by its numeric id, including its comments.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "task id, e.g. '42'" } },
      required: ["id"],
    },
  },
  {
    name: "create_task",
    description: "Create a new task on the board.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        assignee: { type: "string", description: "login slug; omit to leave it claimable" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Update a task's status, assignee, due date, or notes. Only the fields you pass are changed.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", description: "TODO | WIP | BLOCKED | DONE" },
        assignee: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "comment_task",
    description: "Leave a comment on a task.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        content: { type: "string" },
      },
      required: ["id", "content"],
    },
  },
];

const server = new Server(
  { name: "zao-cowork", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    let result;
    switch (name) {
      case "list_tasks": {
        const qs = new URLSearchParams();
        if (args.status) qs.set("status", args.status);
        if (args.assignee) qs.set("assignee", args.assignee);
        if (args.q) qs.set("q", args.q);
        if (args.limit) qs.set("limit", String(args.limit));
        result = await api(`/api/v1/items?${qs.toString()}`);
        break;
      }
      case "get_task":
        result = await api(`/api/v1/items/${encodeURIComponent(args.id)}`);
        break;
      case "create_task":
        result = await api(`/api/v1/items`, {
          method: "POST",
          body: {
            title: args.title,
            assignee: args.assignee,
            due_date: args.due_date,
            notes: args.notes,
          },
        });
        break;
      case "update_task":
        result = await api(`/api/v1/items/${encodeURIComponent(args.id)}`, {
          method: "PATCH",
          body: {
            status: args.status,
            assignee: args.assignee,
            due_date: args.due_date,
            notes: args.notes,
          },
        });
        break;
      case "comment_task":
        result = await api(`/api/v1/items/${encodeURIComponent(args.id)}/comments`, {
          method: "POST",
          body: { content: args.content },
        });
        break;
      default:
        throw new Error(`unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${err.message}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[zao-cowork-mcp] ready");
