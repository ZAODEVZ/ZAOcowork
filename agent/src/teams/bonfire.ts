// ZAOcoworkingBot -> ZABAL Bonfire integration (Phase 1 per Doc 669).
//
// v0.3.1: switched from the guessed kEngram/batch endpoint (which 404'd) to
// the real /knowledge_graph/episode/create endpoint discovered via OpenAPI
// at https://tnt-v2.api.bonfires.ai/openapi.json. Bonfires takes natural-
// language episode bodies; their 20-min auto-extraction builds the KG for
// us (per Doc 673b). We stop crafting structured nodes+edges manually.
//
// Each action-tracker mutation calls bonfireHook(event). The hook:
//   1. converts the TeamEvent to a natural-language episode body
//   2. enqueues to a local jsonl spool (~/.zaocoworking/bonfire-spool.jsonl)
//   3. attempts an HTTP POST /knowledge_graph/episode/create
//   4. on success, marks the spool line sent
//   5. on failure, leaves the line pending for retry on next drain
//
// Hook is a no-op if env vars are not configured.
//
// Env contract:
//   BONFIRE_API_KEY    - revealed via signed message at app.bonfires.ai/dashboard
//   BONFIRE_ID         - the ZABAL bonfire id (24-hex)
//   BONFIRE_API_URL    - defaults to https://tnt-v2.api.bonfires.ai
//   BONFIRE_ENABLED    - any truthy value enables; missing or "false" = skip
//   BONFIRE_DEFAULT_BRAND - tag for events whose brand isn't explicit (default "ZAO")

import type { TeamEvent } from './types';
import { enqueue, readPending, rewrite } from './spool';

const API_KEY = process.env.BONFIRE_API_KEY ?? '';
const BONFIRE_ID = process.env.BONFIRE_ID ?? '';
const API_URL = process.env.BONFIRE_API_URL ?? 'https://tnt-v2.api.bonfires.ai';
const ENABLED = !!process.env.BONFIRE_ENABLED && process.env.BONFIRE_ENABLED !== 'false' && !!API_KEY && !!BONFIRE_ID;
const DEFAULT_BRAND = process.env.BONFIRE_DEFAULT_BRAND ?? 'ZAO';
const FETCH_TIMEOUT_MS = 15_000;

export function isBonfireEnabled(): boolean {
  return ENABLED;
}

export function bonfireStatusLine(): string {
  if (ENABLED) return `bonfire: enabled (id=${BONFIRE_ID.slice(0, 8)}..., url=${API_URL})`;
  const missing: string[] = [];
  if (!API_KEY) missing.push('BONFIRE_API_KEY');
  if (!BONFIRE_ID) missing.push('BONFIRE_ID');
  if (!process.env.BONFIRE_ENABLED) missing.push('BONFIRE_ENABLED');
  return `bonfire: disabled (missing ${missing.join(', ') || 'config'})`;
}

/**
 * Real Bonfires API request shape from /openapi.json CreateEpisodeDirectRequest.
 */
interface EpisodeRequest {
  bonfire_id: string;
  name: string;
  episode_body: string;
  source: 'text' | 'json' | 'message';
  source_description: string;
  reference_time?: string; // ISO datetime
  group_id?: string;
  uuid?: string;
  entity_types?: string[];
}

interface EpisodeResponse {
  success: boolean;
  task_id?: string;
  status?: string; // typically "queued"
  message?: string | null;
}

/**
 * Convert a TeamEvent to an episode request. Each event becomes one natural-
 * language paragraph; Bonfires runs its own entity + relationship extraction
 * on the text. The `name` field doubles as a stable searchable key; the
 * `source_description` carries machine-readable provenance.
 *
 * Brand is included in the body text so the auto-extracted KG groups items
 * under each brand entity (The ZAO, WaveWarZ, COC Concertz, ZABAL, etc).
 */
export function eventToEpisode(event: TeamEvent): EpisodeRequest {
  const brand = event.brand ?? DEFAULT_BRAND;
  const id = event.item.id;
  const ts = event.timestamp;
  const actor = event.actor;
  const item = event.item;

  // Stable episode name: opType + item id + epoch ms slice (allows multiple
  // events on the same item across time)
  const epochMs = String(Date.parse(ts) || Date.now());
  const name = `${event.op}:todo:${id}:${epochMs}`;

  let body: string;
  switch (event.op) {
    case 'add':
      body =
        `${actor} created todo #${id} "${item.title}" in the ${brand} action tracker at ${ts}. ` +
        `Owner: ${item.owner}. Category: ${item.category || 'uncategorized'}. Priority: ${item.priority}.` +
        (item.notes ? ` Notes: ${item.notes}` : '') +
        (item.due ? ` Due: ${item.due}.` : '');
      break;
    case 'wip':
      body =
        `${actor} moved todo #${id} "${item.title}" to in-progress in the ${brand} action tracker at ${ts}. ` +
        `Owner: ${item.owner}. Priority: ${item.priority}.`;
      break;
    case 'blocked':
      body =
        `${actor} marked todo #${id} "${item.title}" BLOCKED in the ${brand} action tracker at ${ts}. ` +
        `Owner: ${item.owner}.` +
        (event.reason ? ` Blocker: ${event.reason}.` : '');
      break;
    case 'done':
      body =
        `${actor} completed todo #${id} "${item.title}" in the ${brand} action tracker at ${ts}. ` +
        `Owner: ${item.owner}. Category: ${item.category || 'uncategorized'}. Priority: ${item.priority}.` +
        (event.reason ? ` Completion note: ${event.reason}.` : '');
      break;
    case 'assign':
      body =
        `${actor} reassigned todo #${id} "${item.title}" from ${event.previousOwner ?? 'previous owner'} to ${item.owner} in the ${brand} action tracker at ${ts}.`;
      break;
    case 'setdue':
      body =
        `${actor} set the due date on todo #${id} "${item.title}" to ${item.due || 'cleared'} in the ${brand} action tracker at ${ts}.` +
        (event.previousDue ? ` Previous due: ${event.previousDue}.` : '');
      break;
    case 'setnote':
      body =
        `${actor} updated notes on todo #${id} "${item.title}" in the ${brand} action tracker at ${ts}. ` +
        `New notes: ${item.notes || '(empty)'}.`;
      break;
    case 'setprio':
      body =
        `${actor} changed priority on todo #${id} "${item.title}" from ${event.previousPriority ?? '?'} to ${item.priority} in the ${brand} action tracker at ${ts}.`;
      break;
    default:
      body = `${actor} performed an unknown operation on todo #${id} "${item.title}" at ${ts}.`;
  }

  return {
    bonfire_id: BONFIRE_ID,
    name,
    episode_body: body,
    source: 'text',
    source_description: `zaocoworking-bot:${event.op}:${id}`,
    reference_time: ts,
  };
}

/**
 * Post an episode to the Bonfires API. Returns true on 2xx. Never throws.
 * Real endpoint per OpenAPI spec: POST {API_URL}/knowledge_graph/episode/create
 */
async function postEpisode(req: EpisodeRequest): Promise<{ ok: boolean; status?: number; taskId?: string; error?: string }> {
  const url = `${API_URL.replace(/\/$/, '')}/knowledge_graph/episode/create`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: body.slice(0, 300) };
    }
    let parsed: EpisodeResponse | null = null;
    try {
      parsed = (await res.json()) as EpisodeResponse;
    } catch {
      // 2xx but unparseable body - still treat as success
    }
    return { ok: true, status: res.status, taskId: parsed?.task_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Main entry point. Called from commands.ts after each successful mutation.
 * Returns immediately if Bonfires is disabled; never throws.
 */
export async function bonfireHook(event: TeamEvent): Promise<void> {
  if (!ENABLED) return;
  let spoolId: string;
  try {
    spoolId = await enqueue(event);
  } catch (err) {
    console.error('[bonfire] enqueue failed:', err);
    return;
  }
  const req = eventToEpisode(event);
  const result = await postEpisode(req);
  const now = new Date().toISOString();
  const updates = new Map<string, unknown>();
  if (result.ok) {
    updates.set(spoolId, {
      id: spoolId,
      event,
      status: 'sent',
      attempts: 1,
      enqueuedAt: now,
      sentAt: now,
      taskId: result.taskId,
    });
    console.log(`[bonfire] sent ${event.op} #${event.item.id} -> task_id=${result.taskId ?? '?'}`);
  } else {
    updates.set(spoolId, {
      id: spoolId,
      event,
      status: 'failed',
      attempts: 1,
      lastError: `status=${result.status ?? '-'} ${result.error ?? ''}`.trim(),
      enqueuedAt: now,
    });
    console.error(`[bonfire] post failed for ${event.op} #${event.item.id}: status=${result.status ?? '-'} ${result.error ?? ''}`);
  }
  await rewrite(updates as never).catch((e) => console.error('[bonfire] spool rewrite failed:', e));
}

/**
 * Drain pending spool lines. Called on bot startup + opportunistically.
 */
export async function drainSpool(): Promise<{ sent: number; failed: number; kept: number }> {
  if (!ENABLED) return { sent: 0, failed: 0, kept: 0 };
  const pending = await readPending();
  if (pending.length === 0) return { sent: 0, failed: 0, kept: 0 };
  const updates = new Map<string, typeof pending[number]>();
  let sent = 0;
  let failed = 0;
  for (const line of pending) {
    const req = eventToEpisode(line.event);
    const result = await postEpisode(req);
    if (result.ok) {
      sent++;
      updates.set(line.id, {
        ...line,
        status: 'sent',
        attempts: line.attempts + 1,
        sentAt: new Date().toISOString(),
      });
    } else {
      failed++;
      updates.set(line.id, {
        ...line,
        status: 'failed',
        attempts: line.attempts + 1,
        lastError: `status=${result.status ?? '-'} ${result.error ?? ''}`.trim(),
      });
    }
  }
  await rewrite(updates).catch((e) => console.error('[bonfire] drain rewrite failed:', e));
  const kept = pending.length - sent - failed;
  console.log(`[bonfire] drain: sent=${sent} failed=${failed} kept=${kept}`);
  return { sent, failed, kept };
}
