"use client";

import { useEffect, useState, useTransition } from "react";
import type { TeamMember, TeamRole } from "@/lib/team";
import {
  addUserAction,
  deleteUserAction,
  resetPasswordAction,
  setActiveAction,
  setRoleAction,
  issueClaudeTokenAction,
  revokeClaudeTokenAction,
} from "@/app/admin/actions";

// /admin Users surface. Server actions handle the writes; this client wrapper
// just renders the form + per-row controls. Founders (Zaal/Iman) are
// protected from demote/delete in the UI - the in-code isAdmin() also has a
// hardcoded admin override for them so any DB-side accident is recoverable.

const ROLES: TeamRole[] = ["admin", "lead", "worker"];

const ZAO_API_URL = "https://thezao.xyz";

// A fully self-contained skill: token + URL baked in, all recipes inline. The
// recipient pastes this straight into Claude (or saves it as a skill file) and
// it works with zero setup — no repo clone, no MCP install, no env vars.
function buildSkillMarkdown(token: string, name: string): string {
  return `---
name: zao-cowork
description: Read and update the ZAO Co-Works task board (thezao.xyz) for ${name}. Use when asked to list, create, update, or comment on tasks/work items, check what's assigned, or mark tasks done.
---

# ZAO Co-Works (${name})

You can drive the ZAO Co-Works board over its API. Auth and base URL are baked
in below — just run the curl commands. Everything you do is attributed to
"${name}".

API base: \`${ZAO_API_URL}\`
Auth header (use on every request): \`Authorization: Bearer ${token}\`

## Recipes

List tasks (filters optional — status TODO|WIP|BLOCKED|DONE, assignee = login slug, q = search):
\`\`\`bash
curl -s "${ZAO_API_URL}/api/v1/items?status=WIP&limit=20" \\
  -H "Authorization: Bearer ${token}"
\`\`\`

Get one task (with comments):
\`\`\`bash
curl -s "${ZAO_API_URL}/api/v1/items/42" -H "Authorization: Bearer ${token}"
\`\`\`

Create a task (title required):
\`\`\`bash
curl -s -X POST "${ZAO_API_URL}/api/v1/items" \\
  -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \\
  -d '{"title":"My task","due_date":"2026-07-03","notes":"details"}'
\`\`\`

Update a task (only fields you send change):
\`\`\`bash
curl -s -X PATCH "${ZAO_API_URL}/api/v1/items/42" \\
  -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \\
  -d '{"status":"DONE"}'
\`\`\`

Comment on a task:
\`\`\`bash
curl -s -X POST "${ZAO_API_URL}/api/v1/items/42/comments" \\
  -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \\
  -d '{"content":"PR merged, closing this out."}'
\`\`\`

## Notes
- Task ids are plain numbers (the #N in the UI). Assignees are lowercase login
  slugs (zaal, iman, thyrev, …). Status: TODO, WIP, BLOCKED, DONE.
- Every response is \`{"ok":true,...}\` or \`{"ok":false,"error":"..."}\`.
- Rate limits: writes 60/min, reads 120/min. On 429, wait \`retryAfterSeconds\` and retry.
- Before creating, search first (\`?q=\`) to avoid duplicates. Leave a comment when you change status.
`;
}

function isFounder(m: TeamMember): boolean {
  const slug = (m.legacy_owner ?? "").toLowerCase();
  return slug === "zaal" || slug === "iman";
}

export function UsersPanel({
  members,
  actorLabel,
  claudeBots = [],
}: {
  members: TeamMember[];
  actorLabel: string;
  claudeBots?: string[];
}) {
  const claudeSet = new Set(claudeBots.map((b) => b.toLowerCase()));
  return (
    <div className="space-y-4">
      <AddUserForm />
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-white/40 border-b border-white/10">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Login slug</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Password</th>
              <th className="px-3 py-2 font-medium">Claude access</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <UserRow
                key={m.id}
                member={m}
                actorLabel={actorLabel}
                hasClaude={claudeSet.has((m.legacy_owner ?? "").toLowerCase())}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-white/40">
        Login slug is the lowercased identifier used in session cookies. Treat it as
        immutable - changing it would invalidate any existing session for that user.
      </p>
    </div>
  );
}

function AddUserForm() {
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const slug = name.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9_-]/g, "").slice(0, 30);
  return (
    <form
      action={async (fd) => {
        // Inject derived slug so the server action receives it
        fd.set("legacy_owner", slug);
        fd.set("role", "worker");
        setPending(true);
        try {
          await addUserAction(fd);
          setName("");
          (document.getElementById("admin-add-user-form") as HTMLFormElement | null)?.reset();
        } finally {
          setPending(false);
        }
      }}
      id="admin-add-user-form"
      className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white/85">Add user</span>
        <span className="text-[10px] text-white/40">creates a login + roster row</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-white/50">Name</label>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cannon Jones"
            required
            className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-zao-accent"
          />
          {slug && (
            <p className="text-[10px] text-white/35">login slug: <span className="text-white/55">{slug}</span></p>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/50">Password</label>
          <input
            name="password"
            type="password"
            placeholder="min 8 chars"
            minLength={8}
            required
            className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-zao-accent"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zao-accent hover:bg-blue-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50 transition"
        >
          {pending ? "Adding..." : "Add user"}
        </button>
      </div>
    </form>
  );
}

function UserRow({ member, hasClaude }: { member: TeamMember; actorLabel: string; hasClaude: boolean }) {
  const founder = isFounder(member);
  const [editingPwd, setEditingPwd] = useState(false);
  const [role, setRole] = useState<TeamRole>(member.role);
  const [roleSaving, startRole] = useTransition();
  const slug = (member.legacy_owner ?? "").toLowerCase();

  // Keep local optimistic value in sync if the server-rendered role changes
  // (e.g. after a refresh or another admin's edit lands).
  useEffect(() => setRole(member.role), [member.role]);

  function changeRole(next: TeamRole) {
    const prev = role;
    setRole(next); // optimistic
    const fd = new FormData();
    fd.set("id", member.id);
    fd.set("role", next);
    startRole(async () => {
      try {
        await setRoleAction(fd);
      } catch {
        setRole(prev); // revert on failure
      }
    });
  }

  return (
    <tr className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]">
      <td className="px-3 py-2 text-white/90">{member.name}</td>
      <td className="px-3 py-2 text-white/60 font-mono text-xs">{member.legacy_owner ?? "-"}</td>
      <td className="px-3 py-2">
        <select
          value={role}
          onChange={(e) => changeRole(e.target.value as TeamRole)}
          disabled={roleSaving || (founder && member.role === "admin")}
          className="rounded-md bg-[#0b1220] border border-white/10 px-2 py-1 text-xs text-white/85 disabled:opacity-60"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-xs text-white/60">
        {editingPwd ? (
          <form
            action={async (fd) => {
              await resetPasswordAction(fd);
              setEditingPwd(false);
            }}
            className="flex items-center gap-1"
          >
            <input type="hidden" name="id" value={member.id} />
            <input
              type="password"
              name="password"
              minLength={8}
              required
              placeholder="new password (8+)"
              className="rounded bg-[#0b1220] border border-white/10 px-2 py-1 text-xs"
            />
            <button
              type="submit"
              className="rounded bg-zao-accent/80 hover:bg-zao-accent px-2 py-1 text-[11px] text-black"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingPwd(false)}
              className="text-[11px] text-white/45 hover:text-white/80"
            >
              cancel
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <span>
              {member.has_password ? (
                <span className="text-emerald-300">DB</span>
              ) : (
                <span className="text-white/40">env-var</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setEditingPwd(true)}
              className="text-[11px] underline text-white/55 hover:text-white/85"
            >
              reset
            </button>
            {member.password_set_at && (
              <span className="text-[10px] text-white/35">
                set {new Date(member.password_set_at).toLocaleDateString()}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <ClaudeAccessCell slug={slug} hasClaude={hasClaude} memberName={member.name} />
      </td>
      <td className="px-3 py-2">
        <form action={setActiveAction} className="inline">
          <input type="hidden" name="id" value={member.id} />
          <input type="hidden" name="active" value={member.active ? "false" : "true"} />
          <button
            type="submit"
            disabled={founder}
            className={`text-[11px] rounded px-2 py-1 border ${
              member.active
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                : "border-white/15 bg-white/[0.04] text-white/55"
            } disabled:opacity-50`}
            title={
              founder
                ? "Founders can't be deactivated"
                : member.active
                  ? "Click to deactivate"
                  : "Click to reactivate"
            }
          >
            {member.active ? "active" : "inactive"}
          </button>
        </form>
      </td>
      <td className="px-3 py-2 text-right">
        {founder ? (
          <span className="text-[10px] text-white/30">protected</span>
        ) : (
          <form action={deleteUserAction} className="inline">
            <input type="hidden" name="id" value={member.id} />
            <button
              type="submit"
              onClick={(e) => {
                if (!window.confirm(`Delete ${member.name}? This removes the login + roster row permanently. Deactivate instead?`)) {
                  e.preventDefault();
                }
              }}
              className="text-[11px] text-red-300/80 hover:text-red-200 underline"
            >
              delete
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}

// Per-user Claude/bot access. Enabling issues a token (shown once) so the
// person's Claude can drive the board under their identity — no SQL, no
// separate "bot" concept to manage.
function ClaudeAccessCell({
  slug,
  hasClaude,
  memberName,
}: {
  slug: string;
  hasClaude: boolean;
  memberName: string;
}) {
  const [pending, start] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function enable() {
    const fd = new FormData();
    fd.set("slug", slug);
    start(async () => {
      const res = await issueClaudeTokenAction(fd);
      setToken(res.token);
    });
  }
  function revoke() {
    if (!window.confirm(`Revoke Claude access for ${memberName}? Their Claude will stop working until re-enabled.`)) return;
    const fd = new FormData();
    fd.set("slug", slug);
    start(async () => {
      await revokeClaudeTokenAction(fd);
      setToken(null);
    });
  }

  if (!slug) return <span className="text-[10px] text-white/25">—</span>;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {hasClaude ? (
          <span className="text-[11px] rounded px-1.5 py-0.5 border border-violet-400/40 bg-violet-500/15 text-violet-200">
            🤖 enabled
          </span>
        ) : (
          <span className="text-[11px] text-white/35">off</span>
        )}
        <button
          type="button"
          onClick={hasClaude ? revoke : enable}
          disabled={pending}
          className="text-[11px] underline text-white/55 hover:text-white/85 disabled:opacity-50"
        >
          {pending ? "…" : hasClaude ? "revoke" : token ? "rotate" : "enable"}
        </button>
      </div>

      {/* The token is shown exactly once, right after issuing. */}
      {token && (
        <div className="rounded-lg border border-violet-400/30 bg-violet-500/10 p-2 space-y-1.5 max-w-[280px]">
          <p className="text-[10px] text-violet-200/90">
            Shown once. Send the skill to {memberName} — they paste it into Claude, no setup.
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(buildSkillMarkdown(token, memberName));
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
            className="w-full text-[11px] font-medium rounded px-2 py-1.5 border border-violet-400/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30"
          >
            {copied ? "✓ copied" : "📋 Copy skill (paste into Claude)"}
          </button>
          <details className="text-[10px] text-white/45">
            <summary className="cursor-pointer hover:text-white/70">just the token / MCP config</summary>
            <div className="mt-1.5 space-y-1.5">
              <div className="flex items-center gap-1">
                <code className="flex-1 truncate text-[10px] text-white/80 font-mono bg-black/30 rounded px-1.5 py-1">
                  {token}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(token)}
                  className="text-[10px] rounded px-1.5 py-1 border border-white/15 text-white/70 hover:bg-white/5"
                >
                  copy
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const cfg = JSON.stringify(
                    {
                      mcpServers: {
                        "zao-cowork": {
                          command: "node",
                          args: ["/path/to/ZAOcowork/mcp-server/index.mjs"],
                          env: { ZAO_API_URL: ZAO_API_URL, ZAO_BOT_TOKEN: token },
                        },
                      },
                    },
                    null,
                    2,
                  );
                  navigator.clipboard?.writeText(cfg);
                }}
                className="w-full text-[10px] rounded px-1.5 py-1 border border-white/15 text-white/70 hover:bg-white/5"
              >
                copy MCP config (needs repo clone)
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  placeholder,
  type = "text",
  required,
  minLength,
  pattern,
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  pattern?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="text-white/55">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        pattern={pattern}
        className="mt-1 w-full rounded-md bg-[#0b1220] border border-white/10 px-2 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-zao-accent/60"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: readonly string[];
  defaultValue?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="text-white/55">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md bg-[#0b1220] border border-white/10 px-2 py-1.5 text-sm text-white/85"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
