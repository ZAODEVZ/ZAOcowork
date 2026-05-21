// Conversation log: archive-first two-stage write per doc 662 B.3.
// - Archive: append-only JSONL at ~/.zaocoworking/archive/<scope>/<yyyy-mm>.jsonl
// - Recent: ring buffer (20 turns) at ~/.zaocoworking/recent/<scope>.json
// Order matters: archive first (can't fail), then ring buffer write-back.

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { COWORK_PATHS } from './paths';
import type { CoworkMessage } from './types';

const RECENT_MAX = 20;

function scopeFromMessage(m: Pick<CoworkMessage, 'chat_type' | 'chat_id'>): string {
  return m.chat_type === 'dm' ? 'private' : m.chat_id;
}

function recentPath(scope: string): string {
  return join(COWORK_PATHS.recent, `${scope}.json`);
}

function archivePath(scope: string, when: Date): string {
  const month = when.toISOString().slice(0, 7);
  return join(COWORK_PATHS.archive, scope, `${month}.jsonl`);
}

export async function logMessage(
  partial: Omit<CoworkMessage, 'id' | 'timestamp'>,
): Promise<CoworkMessage> {
  const now = new Date();
  const full: CoworkMessage = {
    ...partial,
    id: `${partial.chat_id}-${now.getTime()}-${randomUUID().slice(0, 8)}`,
    timestamp: now.toISOString(),
  };
  const scope = scopeFromMessage(partial);

  // Stage 1 - archive (permanent, can't fail)
  const aPath = archivePath(scope, now);
  await fs.mkdir(dirname(aPath), { recursive: true });
  await fs.appendFile(aPath, `${JSON.stringify(full)}\n`, 'utf8');

  // Stage 2 - ring buffer (best-effort; archive already captured)
  try {
    const rPath = recentPath(scope);
    let recent: CoworkMessage[] = [];
    try {
      const raw = await fs.readFile(rPath, 'utf8');
      recent = JSON.parse(raw) as CoworkMessage[];
    } catch {
      // missing file - normal first turn in this scope
    }
    recent.push(full);
    if (recent.length > RECENT_MAX) {
      recent = recent.slice(-RECENT_MAX);
    }
    await fs.mkdir(COWORK_PATHS.recent, { recursive: true });
    await fs.writeFile(rPath, JSON.stringify(recent, null, 2), 'utf8');
  } catch (err) {
    console.error('[transcripts] recent write failed (archive ok):', (err as Error).message);
  }

  return full;
}

export async function readRecent(scope: string): Promise<CoworkMessage[]> {
  try {
    const raw = await fs.readFile(recentPath(scope), 'utf8');
    return JSON.parse(raw) as CoworkMessage[];
  } catch {
    return [];
  }
}
