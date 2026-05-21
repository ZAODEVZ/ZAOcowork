// JSONL spool for retry on Bonfires API failure.
// Every TeamEvent gets appended to the spool BEFORE the HTTP attempt.
// On success, the line is marked sent. Retries drain the spool on next
// successful POST or on bot restart.
//
// File: ~/.zaocoworking/bonfire-spool.jsonl
// Each line: { id, event, status: 'pending' | 'sent' | 'failed', attempts, lastError? }
//
// Compaction: on each drain pass, lines marked 'sent' older than 24h get
// pruned to keep the file bounded. Failed lines older than 7 days get
// quarantined to bonfire-spool.dead.jsonl for offline inspection.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { COWORK_PATHS } from '../paths';
import type { TeamEvent } from './types';

const SPOOL_FILE = join(COWORK_PATHS.home, 'bonfire-spool.jsonl');
const DEAD_FILE = join(COWORK_PATHS.home, 'bonfire-spool.dead.jsonl');
const SENT_TTL_MS = 24 * 60 * 60 * 1000;
const DEAD_AFTER_ATTEMPTS = 5;
const QUARANTINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface SpoolLine {
  id: string;
  event: TeamEvent;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastError?: string;
  enqueuedAt: string;
  sentAt?: string;
}

function newId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export async function enqueue(event: TeamEvent): Promise<string> {
  const line: SpoolLine = {
    id: newId(),
    event,
    status: 'pending',
    attempts: 0,
    enqueuedAt: new Date().toISOString(),
  };
  await fs.mkdir(COWORK_PATHS.home, { recursive: true });
  await fs.appendFile(SPOOL_FILE, JSON.stringify(line) + '\n', 'utf8');
  return line.id;
}

export async function readPending(): Promise<SpoolLine[]> {
  let raw: string;
  try {
    raw = await fs.readFile(SPOOL_FILE, 'utf8');
  } catch {
    return [];
  }
  const lines: SpoolLine[] = [];
  for (const ln of raw.split('\n')) {
    const t = ln.trim();
    if (!t) continue;
    try {
      const parsed = JSON.parse(t) as SpoolLine;
      if (parsed.status === 'pending') lines.push(parsed);
    } catch {
      // skip malformed line
    }
  }
  return lines;
}

/**
 * Rewrite the spool atomically with the given line states. Compacts away
 * sent lines older than SENT_TTL_MS and moves >5-attempt failures to dead.
 */
export async function rewrite(updates: Map<string, SpoolLine>): Promise<void> {
  let raw = '';
  try {
    raw = await fs.readFile(SPOOL_FILE, 'utf8');
  } catch {
    raw = '';
  }
  const now = Date.now();
  const kept: SpoolLine[] = [];
  const dead: SpoolLine[] = [];
  for (const ln of raw.split('\n')) {
    const t = ln.trim();
    if (!t) continue;
    let parsed: SpoolLine;
    try {
      parsed = JSON.parse(t) as SpoolLine;
    } catch {
      continue;
    }
    const updated = updates.get(parsed.id) ?? parsed;
    if (updated.status === 'sent') {
      const sentAt = updated.sentAt ? new Date(updated.sentAt).getTime() : 0;
      if (now - sentAt < SENT_TTL_MS) {
        kept.push(updated);
      }
      continue;
    }
    if (updated.status === 'failed' && updated.attempts >= DEAD_AFTER_ATTEMPTS) {
      const enqueuedAt = new Date(updated.enqueuedAt).getTime();
      if (now - enqueuedAt < QUARANTINE_TTL_MS) {
        dead.push(updated);
      }
      continue;
    }
    kept.push(updated);
  }
  const tmp = SPOOL_FILE + '.tmp';
  await fs.writeFile(tmp, kept.map((l) => JSON.stringify(l)).join('\n') + (kept.length ? '\n' : ''), 'utf8');
  await fs.rename(tmp, SPOOL_FILE);
  if (dead.length) {
    await fs.appendFile(DEAD_FILE, dead.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  }
}
