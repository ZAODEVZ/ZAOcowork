// GitHub Contents API read/write for data/facts.json. Reads and writes go
// straight to GitHub rather than the local bundled copy, so /admin/facts
// always shows (and commits to) the real source of truth - not whatever
// happened to be baked into this serverless instance at its last deploy.
// See docs/shared-facts.md for the full facts.json workflow.

export interface FactEntry {
  value: string;
  description: string;
  lastVerified: string;
}

export type FactsMap = Record<string, FactEntry>;

const FACTS_PATH = "data/facts.json";

function repoAndBranch() {
  const repo = process.env.GITHUB_REPO || "ZAODEVZ/ZAOcowork";
  const branch = process.env.GITHUB_BRANCH || "main";
  return { repo, branch };
}

function token(): string {
  const t = process.env.GITHUB_FACTS_TOKEN;
  if (!t) throw new Error("GITHUB_FACTS_TOKEN not configured - facts editing is disabled");
  return t;
}

export function factsConfigured(): boolean {
  return Boolean(process.env.GITHUB_FACTS_TOKEN);
}

async function githubFetch(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function readFactsFromGitHub(): Promise<{ facts: FactsMap; sha: string }> {
  const { repo, branch } = repoAndBranch();
  const data = await githubFetch(`/repos/${repo}/contents/${FACTS_PATH}?ref=${branch}`);
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { facts: JSON.parse(content), sha: data.sha };
}

// Re-reads facts.json immediately before writing (rather than trusting a
// sha captured earlier in the request) so two admins editing at once get a
// real 409 from GitHub instead of one silently clobbering the other.
export async function writeFactToGitHub(key: string, newValue: string): Promise<void> {
  const { repo, branch } = repoAndBranch();
  const { facts, sha } = await readFactsFromGitHub();
  if (!(key in facts)) throw new Error(`Unknown fact key: ${key}`);

  const today = new Date().toISOString().slice(0, 10);
  const updated: FactsMap = {
    ...facts,
    [key]: { ...facts[key], value: newValue, lastVerified: today },
  };

  const updatedContent = JSON.stringify(updated, null, 2) + "\n";
  await githubFetch(`/repos/${repo}/contents/${FACTS_PATH}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `facts: update ${key} via /admin/facts`,
      content: Buffer.from(updatedContent, "utf8").toString("base64"),
      sha,
      branch,
    }),
  });
}
