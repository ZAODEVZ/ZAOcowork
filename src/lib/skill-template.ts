// Shared builder for the paste-ready ZAO skill, used server-side (the claim
// endpoint returns it after a code is redeemed). Token is embedded so the
// recipient's Claude can call the API immediately — but it only ever reaches
// them through a one-time claim, never a long-lived shared file.

export const ZAO_API_URL = "https://thezao.xyz";

export function buildSkillMarkdown(token: string, name: string): string {
  return `---
name: zao-cowork
description: Read and update the ZAO Co-Works task board (thezao.xyz) for ${name}. Use when asked to list, create, update, or comment on tasks/work items, check what's assigned, or mark tasks done.
---

# ZAO Co-Works (${name})

You can drive the ZAO Co-Works board over its API. Auth and base URL are baked
in below — just run the curl commands. There is nothing to install or clone.
Everything you do is attributed to "${name}".

API base: \`${ZAO_API_URL}\`
Auth header (use on every request): \`Authorization: Bearer ${token}\`

## Recipes

List tasks (filters optional — status TODO|WIP|BLOCKED|DONE, assignee = login slug, q = search):
\`\`\`bash
curl -s "${ZAO_API_URL}/api/v1/items?status=WIP&limit=20" -H "Authorization: Bearer ${token}"
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
- Task ids are plain numbers. Assignees are lowercase login slugs. Status: TODO, WIP, BLOCKED, DONE.
- Every response is \`{"ok":true,...}\` or \`{"ok":false,"error":"..."}\`.
- Rate limits: writes 60/min, reads 120/min. On 429, wait \`retryAfterSeconds\` and retry.
- Before creating, search first (\`?q=\`) to avoid duplicates. Leave a comment when you change status.
`;
}

/** The text an admin shares — contains only the one-time code, no token. */
export function buildClaimInstructions(code: string, expiresMinutes: number): string {
  return `# Connect to the ZAO Co-Works board (one-time setup)

Paste this whole message to your Claude. It will run one command to connect —
nothing to install or download. This code works once and expires in
${expiresMinutes} minutes.

Run this once to connect:
\`\`\`bash
curl -s -X POST "${ZAO_API_URL}/api/v1/claim" \\
  -H "Content-Type: application/json" \\
  -d '{"code":"${code}"}'
\`\`\`

The response contains your personal access token and the full skill
instructions (how to list, create, update, and comment on board tasks). Follow
those instructions from then on. Keep the token private — treat it like a password.
`;
}
