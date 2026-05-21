// Suggest-then-confirm pattern per doc 662 B.7.
// The bot's claude reply may include a fenced ```json-suggest block proposing
// one action mutation, OR a JSON array of them. We parse it, surface it to the
// user, and only execute if the next reply from the same user in the same chat
// (within 5 min) is affirmative.

import { promises as fs } from 'node:fs';
import { Context } from 'grammy';
import { COWORK_PATHS } from './paths';
import {
  canonicalizeOwner,
  cmdAdd,
  cmdAddBatch,
  cmdAssign,
  cmdBlocked,
  cmdDone,
  cmdSetDue,
  cmdSetNote,
  cmdSetPrio,
  cmdWip,
} from './commands';
import type { SuggestActionOp } from './types';
import { isAutoConfirm } from './users';

interface PendingSuggestion {
  chat_id: number;
  from_user_id: number;
  suggestions: SuggestActionOp[];
  createdAt: string;
}

const PENDING_TTL_MS = 5 * 60_000;

const SUGGEST_RE = /```json-suggest\s*([\s\S]*?)\s*```/i;
const YES_RE = /^(y|yes|yep|yeah|sure|do it|confirm|ok|okay|👍)\b/i;
const NO_RE = /^(n|no|nope|nah|cancel|stop|skip|nvm|nevermind)\b/i;

export function stripSuggestionBlock(text: string): string {
  return text.replace(SUGGEST_RE, '').trim();
}

function isSuggestActionOp(x: unknown): x is SuggestActionOp {
  return !!x && typeof x === 'object' && typeof (x as { op?: unknown }).op === 'string';
}

// v2.16 - the json-suggest block may hold a single op object OR a JSON array of
// them. A bulk paste ("here are 12 todos") makes the LLM emit an array; the old
// parser only accepted a single object, returned null on an array, and the raw
// block leaked into the chat. Always return an array; [] means nothing usable.
export function extractSuggestions(text: string): SuggestActionOp[] {
  const m = text.match(SUGGEST_RE);
  if (!m) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1].trim());
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.filter(isSuggestActionOp);
}

// Back-compat single-suggestion accessor (first op only).
export function extractSuggestion(text: string): SuggestActionOp | null {
  return extractSuggestions(text)[0] ?? null;
}

export function describeSuggestion(s: SuggestActionOp): string {
  switch (s.op) {
    case 'add':
      return `add new item "${s.title ?? '(?)'}"${s.owner ? ` for ${s.owner}` : ''}${s.category ? ` in ${s.category}` : ''}`;
    case 'wip':
      return `move #${s.id} to WIP`;
    case 'blocked':
      return `mark #${s.id} BLOCKED${s.reason ? ` (${s.reason})` : ''}`;
    case 'done':
      return `mark #${s.id} DONE${s.reason ? ` (${s.reason})` : ''}`;
    case 'assign':
      return `reassign #${s.id} -> ${s.owner}`;
    case 'setdue':
      return `set due on #${s.id} -> ${s.due || '(clear)'}`;
    case 'setnote':
      return s.appendNotes
        ? `append note on #${s.id}`
        : `replace notes on #${s.id}`;
    case 'setprio':
      return `set priority on #${s.id} -> ${s.priority}`;
  }
}

// v2.16 - human-readable summary for one or many suggestions. A pure run of
// `add` ops renders as a clean checklist; mixed ops list one line each.
export function describeSuggestions(list: SuggestActionOp[]): string {
  if (list.length === 1) return describeSuggestion(list[0]);
  if (list.every((s) => s.op === 'add')) {
    const titles = list.map(
      (s) => `- ${s.title ?? '(?)'}${s.owner ? ` [${s.owner}]` : ''}`,
    );
    return `add ${list.length} new items:\n${titles.join('\n')}`;
  }
  return `${list.length} changes:\n${list.map((s) => `- ${describeSuggestion(s)}`).join('\n')}`;
}

export async function savePending(p: PendingSuggestion): Promise<void> {
  await fs.mkdir(COWORK_PATHS.home, { recursive: true });
  await fs.writeFile(COWORK_PATHS.pending, JSON.stringify(p, null, 2), 'utf8');
}

export async function loadPending(): Promise<PendingSuggestion | null> {
  try {
    const raw = await fs.readFile(COWORK_PATHS.pending, 'utf8');
    const p = JSON.parse(raw) as PendingSuggestion & { suggestion?: SuggestActionOp };
    // v2.16 - tolerate a pending file written by the pre-batch (single) format.
    if (!Array.isArray(p.suggestions) && p.suggestion) {
      p.suggestions = [p.suggestion];
    }
    if (!Array.isArray(p.suggestions) || p.suggestions.length === 0) {
      await fs.unlink(COWORK_PATHS.pending).catch(() => {});
      return null;
    }
    if (Date.now() - new Date(p.createdAt).getTime() > PENDING_TTL_MS) {
      await fs.unlink(COWORK_PATHS.pending).catch(() => {});
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export async function clearPending(): Promise<void> {
  await fs.unlink(COWORK_PATHS.pending).catch(() => {});
}

// v2.13 - when a json-suggest block is present, the LLM's free-text portion is
// pure narration. Doc 671 found this is the single biggest source of "approve
// in the system dialog" / "I need write permission" hallucinations. Throw it
// away and replace with a templated, short, deterministic preamble built from
// the suggestion itself. The user gets clean output every time and the LLM's
// prose can no longer leak fictional permission flows.
// v2.16 - also strip the block when it is present but unparseable (e.g. a
// malformed array), so a raw json-suggest block can NEVER reach the chat.
export async function maybeStartSuggestionFlow(
  ctx: Context,
  botReply: string,
): Promise<string> {
  if (!SUGGEST_RE.test(botReply)) return botReply;

  const suggestions = extractSuggestions(botReply);
  const narration = stripSuggestionBlock(botReply);

  if (suggestions.length === 0) {
    // Block present but unparseable - never echo raw JSON at the user.
    return (
      narration ||
      'i drafted that change but the action block came back malformed - say it once more and i will retry.'
    );
  }

  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return describeSuggestions(suggestions);

  // v2.11 - if user has auto_confirm on, skip the suggest-then-confirm step
  // and execute directly. Trade safety for speed; default off.
  if (await isAutoConfirm(userId)) {
    await executeSuggestions(ctx, suggestions);
    return `done: ${describeSuggestions(suggestions)}`;
  }

  await savePending({
    chat_id: chatId,
    from_user_id: userId,
    suggestions,
    createdAt: new Date().toISOString(),
  });
  return `suggested: ${describeSuggestions(suggestions)}\nreply "yes" to confirm or anything else to cancel\n(tip: /autoconfirm on - skip this step on future NL edits)`;
}

/**
 * Returns true if this message was a confirmation of a pending suggestion
 * (and we handled the execution). False otherwise - caller should proceed with
 * normal concierge flow.
 *
 * v2.14 - was treating ANY non-yes message inside the 5-min TTL as "cancelled",
 * which ate unrelated follow-up questions ("what's on Zaal's plate?" 4 min after
 * a suggestion became "cancelled" + the question was lost). Now only short
 * explicit yes/no responses match; anything else falls through to the normal
 * LLM path. The pending TTL expires naturally.
 */
export async function maybeHandleConfirmation(ctx: Context, text: string): Promise<boolean> {
  const pending = await loadPending();
  if (!pending) return false;
  if (pending.chat_id !== ctx.chat?.id || pending.from_user_id !== ctx.from?.id) return false;

  // v2.17 - strip a leading @mention so "@ZAOcoworkingBot yes" confirms too
  // (in a group the user often @-prefixes; the bare ^yes anchor missed it).
  const trimmed = text.trim().replace(/^@[A-Za-z0-9_]+\s+/, '').trim();
  const isYes = YES_RE.test(trimmed);
  const isNo = NO_RE.test(trimmed);
  // Cap response length too: long messages are clearly a new conversation,
  // not a confirm/cancel. 40 chars handles "yes please" / "no thanks" / etc.
  if (!isYes && !isNo) return false;
  if (trimmed.length > 40 && !isYes) return false;

  await clearPending();
  if (isNo) {
    await ctx.reply('cancelled');
    return true;
  }
  await executeSuggestions(ctx, pending.suggestions);
  return true;
}

// v2.16 - execute a batch. A pure run of `add` ops goes through cmdAddBatch
// (one commit, one reply); a single op or a mixed batch runs op-by-op.
async function executeSuggestions(ctx: Context, list: SuggestActionOp[]): Promise<void> {
  if (list.length === 0) return;
  if (list.length > 1 && list.every((s) => s.op === 'add')) {
    await cmdAddBatch(
      ctx,
      list.map((s) => ({
        title: s.title ?? '',
        owner: canonicalizeOwner(s.owner) ?? undefined,
      })),
    );
    return;
  }
  for (const s of list) {
    await executeSuggestion(ctx, s);
  }
}

async function executeSuggestion(ctx: Context, s: SuggestActionOp): Promise<void> {
  switch (s.op) {
    case 'add': {
      // v2.15 - was dropping s.owner entirely so "add task for Iman" fell
      // back to the caller's owner (or worse, 'Open' if caller not in
      // USER_NAMES env). Canonicalise + pass through.
      const overrideOwner = canonicalizeOwner(s.owner) ?? undefined;
      await cmdAdd(ctx, s.title ?? '', overrideOwner);
      return;
    }
    case 'wip':
      await cmdWip(ctx, s.id ?? '');
      return;
    case 'blocked':
      await cmdBlocked(ctx, `${s.id ?? ''} ${s.reason ?? ''}`);
      return;
    case 'done':
      await cmdDone(ctx, s.id ?? '');
      return;
    case 'assign':
      await cmdAssign(ctx, `${s.id ?? ''} ${s.owner ?? ''}`);
      return;
    case 'setdue':
      await cmdSetDue(ctx, `${s.id ?? ''} ${s.due ?? 'clear'}`);
      return;
    case 'setnote': {
      const prefix = s.appendNotes ? 'append: ' : '';
      const text = s.appendNotes ?? s.notes ?? '';
      await cmdSetNote(ctx, `${s.id ?? ''} ${prefix}${text}`);
      return;
    }
    case 'setprio':
      await cmdSetPrio(ctx, `${s.id ?? ''} ${s.priority ?? ''}`);
      return;
  }
}
