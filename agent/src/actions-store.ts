// Octokit Contents API wrapper for data/actions.json.
// SHA dance per doc 662 B.5: every write requires the SHA from the last read.
// On 409 Conflict, re-read + re-apply + retry up to 3x with exponential backoff.

import { Octokit } from '@octokit/rest';
import { promises as fs } from 'node:fs';
import { COWORK_PATHS } from './paths';
import type { ActionsFile, ActionItem, Owner, Phase, Priority } from './types';

const OWNER = process.env.GITHUB_REPO?.split('/')[0] ?? 'songchaindao-dot';
const REPO = process.env.GITHUB_REPO?.split('/')[1] ?? 'cowork-zaodevz';
const PATH = 'data/actions.json';
const BRANCH = process.env.GITHUB_BRANCH ?? 'main';

function octokit(): Octokit {
  const auth = process.env.GITHUB_TOKEN;
  if (!auth) throw new Error('GITHUB_TOKEN missing - cannot read/write data/actions.json');
  return new Octokit({ auth });
}

export interface ActionsWithSha {
  data: ActionsFile;
  sha: string;
}

export async function fetchActions(): Promise<ActionsWithSha> {
  const res = await octokit().repos.getContent({ owner: OWNER, repo: REPO, path: PATH, ref: BRANCH });
  if (Array.isArray(res.data) || res.data.type !== 'file') {
    throw new Error(`expected file at ${PATH}, got ${'type' in res.data ? res.data.type : 'array'}`);
  }
  const content = Buffer.from(res.data.content, 'base64').toString('utf8');
  const data = JSON.parse(content) as ActionsFile;
  await cacheActions(data, res.data.sha);
  return { data, sha: res.data.sha };
}

export async function readActionsCache(): Promise<ActionsFile | null> {
  try {
    const raw = await fs.readFile(COWORK_PATHS.actionsCache, 'utf8');
    return JSON.parse(raw) as ActionsFile;
  } catch {
    return null;
  }
}

async function cacheActions(data: ActionsFile, sha: string): Promise<void> {
  await fs.mkdir(COWORK_PATHS.home, { recursive: true });
  await fs.writeFile(COWORK_PATHS.actionsCache, JSON.stringify(data, null, 2), 'utf8');
  await fs.writeFile(COWORK_PATHS.actionsSha, sha, 'utf8');
}

async function commitActions(data: ActionsFile, sha: string, message: string): Promise<string> {
  data.updatedAt = new Date().toISOString();
  const res = await octokit().repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path: PATH,
    branch: BRANCH,
    message,
    sha,
    content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
  });
  const newSha = res.data.content?.sha;
  if (!newSha) throw new Error('commit returned no sha');
  await cacheActions(data, newSha);
  return newSha;
}

/**
 * Apply a mutation to data/actions.json with SHA-dance retry on conflict.
 * mutator is called with the FRESHEST data and must return either:
 * - a mutated data object to commit
 * - null/undefined to skip the commit (no-op)
 */
export async function mutateActions<T>(
  mutator: (data: ActionsFile) => Promise<{ data: ActionsFile; commitMessage: string; result: T } | null>,
  maxAttempts = 3,
): Promise<T | null> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { data, sha } = await fetchActions();
      const out = await mutator(structuredClone(data));
      if (!out) return null;
      await commitActions(out.data, sha, out.commitMessage);
      return out.result;
    } catch (err) {
      lastErr = err as Error;
      const status = (err as { status?: number }).status;
      if (status !== 409 && status !== 422) throw err;
      const backoffMs = 100 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw new Error(`actions mutation failed after ${maxAttempts} attempts: ${lastErr?.message}`);
}

export function nextItemId(items: ActionItem[]): string {
  const max = items.reduce((m, i) => {
    const n = Number(i.id);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

export interface NewActionInput {
  title: string;
  owner: Owner;
  createdBy: string;
  category?: string;
  priority?: Priority;
  phase?: Phase;
  notes?: string;
}

export function makeActionItem(input: NewActionInput, items: ActionItem[]): ActionItem {
  const now = new Date().toISOString();
  return {
    id: nextItemId(items),
    title: input.title.trim(),
    createdBy: input.createdBy,
    owner: input.owner,
    status: 'TODO',
    category: input.category ?? 'Other',
    priority: input.priority ?? 'P2',
    important: false,
    urgent: false,
    completedAt: '',
    completedBy: '',
    phase: input.phase ?? 'Define',
    due: '',
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
  };
}
