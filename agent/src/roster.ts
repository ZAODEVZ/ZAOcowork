// Team roster - single source of truth for who can use the bot + who can own
// items. Lives at data/team.json in the repo so:
//   - adding a user = edit one file (web app UI later, or PR) - NO bot restart
//   - both bot + web app read the same roster
//   - all changes are git-tracked
//
// Bot fetches via Octokit on boot + every TTL_MS. mtime cache via SHA dance.
// Local fallback to ENV vars if Octokit unreachable (cold-start, network drop).

import { Octokit } from '@octokit/rest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { COWORK_PATHS } from './paths';

const OWNER = process.env.GITHUB_REPO?.split('/')[0] ?? 'songchaindao-dot';
const REPO = process.env.GITHUB_REPO?.split('/')[1] ?? 'cowork-zaodevz';
const PATH = 'data/team.json';
const BRANCH = process.env.GITHUB_BRANCH ?? 'main';
const TTL_MS = 5 * 60_000; // re-fetch roster every 5 min

const ROSTER_CACHE = join(COWORK_PATHS.home, 'team.json');
const ROSTER_SHA = join(COWORK_PATHS.home, 'team-sha.txt');

export interface TeamMember {
  name: string;
  telegram_id: number | null;
  owner_value: string;
  role: 'lead' | 'worker';
  admin: boolean;
  added_at: string;
}

export interface AllowedChat {
  chat_id: number;
  title: string;
  added_at: string;
}

export interface TeamFile {
  updatedAt: string;
  members: TeamMember[];
  allowed_chats: AllowedChat[];
}

interface RosterCache {
  data: TeamFile;
  sha: string;
  fetchedAt: number;
}

let memCache: RosterCache | null = null;

function octokit(): Octokit | null {
  const auth = process.env.GITHUB_TOKEN;
  if (!auth) return null;
  return new Octokit({ auth });
}

async function fetchFromGithub(): Promise<RosterCache | null> {
  const oc = octokit();
  if (!oc) return null;
  try {
    const res = await oc.repos.getContent({ owner: OWNER, repo: REPO, path: PATH, ref: BRANCH });
    if (Array.isArray(res.data) || res.data.type !== 'file') return null;
    const data = JSON.parse(Buffer.from(res.data.content, 'base64').toString('utf8')) as TeamFile;
    return { data, sha: res.data.sha, fetchedAt: Date.now() };
  } catch (err) {
    console.error('[roster] github fetch failed:', (err as Error).message);
    return null;
  }
}

async function readLocalCache(): Promise<RosterCache | null> {
  try {
    const [raw, sha] = await Promise.all([
      fs.readFile(ROSTER_CACHE, 'utf8'),
      fs.readFile(ROSTER_SHA, 'utf8').catch(() => ''),
    ]);
    return { data: JSON.parse(raw) as TeamFile, sha: sha.trim(), fetchedAt: 0 };
  } catch {
    return null;
  }
}

async function writeLocalCache(c: RosterCache): Promise<void> {
  await fs.mkdir(COWORK_PATHS.home, { recursive: true });
  await fs.writeFile(ROSTER_CACHE, JSON.stringify(c.data, null, 2), 'utf8');
  await fs.writeFile(ROSTER_SHA, c.sha, 'utf8');
}

function buildFromEnvFallback(): TeamFile {
  const ids = (process.env.ALLOWLIST_USER_IDS ?? '').split(',').map((s) => Number(s.trim())).filter(Boolean);
  const names: Record<string, string> = {};
  for (const pair of (process.env.USER_NAMES ?? '').split(',')) {
    const [id, n] = pair.split(':').map((s) => s.trim());
    if (id && n) names[id] = n;
  }
  const admins = new Set((process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const chats = (process.env.ALLOWLIST_CHAT_IDS ?? '').split(',').map((s) => Number(s.trim())).filter(Boolean);
  return {
    updatedAt: new Date().toISOString(),
    members: ids.map((id) => ({
      name: names[String(id)] ?? `user:${id}`,
      telegram_id: id,
      owner_value: names[String(id)] ?? 'Open',
      role: admins.has(String(id)) ? 'lead' : 'worker',
      admin: admins.has(String(id)),
      added_at: new Date().toISOString(),
    })),
    allowed_chats: chats.map((id) => ({
      chat_id: id,
      title: '(env-seeded)',
      added_at: new Date().toISOString(),
    })),
  };
}

export async function loadRoster(force = false): Promise<TeamFile> {
  if (!force && memCache && Date.now() - memCache.fetchedAt < TTL_MS) {
    return memCache.data;
  }
  // Try Github first (source of truth)
  const fresh = await fetchFromGithub();
  if (fresh) {
    memCache = fresh;
    await writeLocalCache(fresh);
    return fresh.data;
  }
  // Fall back to local cache (last known good)
  const cached = await readLocalCache();
  if (cached) {
    memCache = cached;
    return cached.data;
  }
  // Final fallback: build from ENV vars (cold start without Github)
  const envBuilt = buildFromEnvFallback();
  memCache = { data: envBuilt, sha: '', fetchedAt: Date.now() };
  console.warn('[roster] using ENV fallback - no GITHUB_TOKEN + no local cache');
  return envBuilt;
}

export async function forceReloadRoster(): Promise<TeamFile> {
  memCache = null;
  return loadRoster(true);
}

/** O(1) check helpers built from the latest roster */
export interface RosterView {
  allowedUserIds: Set<number>;
  allowedChatIds: Set<number>;
  adminUserIds: Set<number>;
  ownerByTgId: Map<number, string>;
  nameByTgId: Map<number, string>;
  memberCount: number;
  chatCount: number;
  updatedAt: string;
}

export async function rosterView(): Promise<RosterView> {
  const team = await loadRoster();
  const allowedUserIds = new Set<number>();
  const adminUserIds = new Set<number>();
  const ownerByTgId = new Map<number, string>();
  const nameByTgId = new Map<number, string>();
  for (const m of team.members) {
    if (m.telegram_id != null) {
      allowedUserIds.add(m.telegram_id);
      ownerByTgId.set(m.telegram_id, m.owner_value);
      nameByTgId.set(m.telegram_id, m.name);
      if (m.admin) adminUserIds.add(m.telegram_id);
    }
  }
  const allowedChatIds = new Set(team.allowed_chats.map((c) => c.chat_id));
  return {
    allowedUserIds,
    allowedChatIds,
    adminUserIds,
    ownerByTgId,
    nameByTgId,
    memberCount: team.members.length,
    chatCount: team.allowed_chats.length,
    updatedAt: team.updatedAt,
  };
}

/** Add or update a member. Commits data/team.json to repo via Octokit. */
export async function addOrUpdateMember(input: {
  name: string;
  telegram_id: number;
  owner_value?: string;
  role?: 'lead' | 'worker';
  admin?: boolean;
}): Promise<TeamMember> {
  const oc = octokit();
  if (!oc) throw new Error('GITHUB_TOKEN missing - cannot write team.json');
  const team = await loadRoster(true);
  let member = team.members.find((m) => m.telegram_id === input.telegram_id);
  if (member) {
    member.name = input.name;
    if (input.owner_value !== undefined) member.owner_value = input.owner_value;
    if (input.role !== undefined) member.role = input.role;
    if (input.admin !== undefined) member.admin = input.admin;
  } else {
    member = {
      name: input.name,
      telegram_id: input.telegram_id,
      owner_value: input.owner_value ?? input.name,
      role: input.role ?? 'worker',
      admin: input.admin ?? false,
      added_at: new Date().toISOString(),
    };
    team.members.push(member);
  }
  team.updatedAt = new Date().toISOString();
  await commitRoster(team, `bot: roster update - ${input.telegram_id} (${input.name})`);
  await forceReloadRoster();
  return member;
}

/** Add a chat to the allowlist. */
export async function addAllowedChat(chatId: number, title: string): Promise<void> {
  const oc = octokit();
  if (!oc) throw new Error('GITHUB_TOKEN missing - cannot write team.json');
  const team = await loadRoster(true);
  if (team.allowed_chats.some((c) => c.chat_id === chatId)) return;
  team.allowed_chats.push({ chat_id: chatId, title, added_at: new Date().toISOString() });
  team.updatedAt = new Date().toISOString();
  await commitRoster(team, `bot: allow chat ${chatId} (${title})`);
  await forceReloadRoster();
}

async function commitRoster(team: TeamFile, message: string): Promise<void> {
  const oc = octokit();
  if (!oc) throw new Error('GITHUB_TOKEN missing');
  const sha = memCache?.sha ?? '';
  const res = await oc.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path: PATH,
    branch: BRANCH,
    message,
    sha: sha || undefined,
    content: Buffer.from(JSON.stringify(team, null, 2)).toString('base64'),
  });
  const newSha = res.data.content?.sha;
  if (newSha) {
    memCache = { data: team, sha: newSha, fetchedAt: Date.now() };
    await writeLocalCache(memCache);
  }
}
