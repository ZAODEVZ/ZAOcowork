// Slash command handlers per doc 662 B.6 + v2.10 setfield extension.
// Tracker: /start /mine /list /add /wip /blocked /done /assign /daily
// Setfield (v2.10): /setdue /setnote /setprio
// Each mutation goes through mutateActions() with SHA-dance retry.

import { Context, InlineKeyboard } from 'grammy';
import { fetchActions, makeActionItem, mutateActions } from './actions-store';
import { parseBrandHashtags } from './brands';
import { notifyAssigned, notifyStatusChange } from './notifications';
import { rosterView } from './roster';
import { ownerToTgIdSupabase, tgIdToOwnerSupabase } from './supabase-roster';
import { bonfireHook } from './teams';
import type { TeamEventOp } from './teams';
import type { ActionItem, ActionStatus, Owner, Priority } from './types';
import { OWNERS } from './types';

const PRIORITIES: readonly Priority[] = ['P1', 'P2', 'P3'];

// Fire-and-forget hook to the ZABAL Bonfire (Doc 669 Phase 1). No-op if env
// vars not configured. Never throws. Always best-effort - the action tracker
// remains the source of truth; bonfire is an aggregated view layer.
function fireBonfire(
  op: TeamEventOp,
  item: ActionItem,
  ctx: Context,
  extras: { reason?: string; previousOwner?: Owner; previousDue?: string; previousPriority?: Priority } = {},
): void {
  const actor = callerDisplayName(ctx);
  const actorTgId = ctx.from?.id ?? 0;
  bonfireHook({
    op,
    item,
    actor,
    actorTgId,
    timestamp: new Date().toISOString(),
    ...extras,
  }).catch((err) => {
    console.error('[bonfire] hook threw (should not):', err);
  });
}

interface UserNameMap {
  [tgUserId: string]: Owner;
}

function parseUserNames(env: string | undefined): UserNameMap {
  const map: UserNameMap = {};
  if (!env) return map;
  for (const pair of env.split(',')) {
    const [id, name] = pair.split(':').map((s) => s.trim());
    if (id && name && (OWNERS as readonly string[]).includes(name)) {
      map[id] = name as Owner;
    }
  }
  return map;
}

const USER_NAMES = parseUserNames(process.env.USER_NAMES);
const ADMIN_IDS = new Set((process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean));

// v2.15 - was only reading USER_NAMES env, which is stale on most installs
// (Iman not in env -> new items got owner=Open even when Iman created them).
// Now consults the roster first (data/team.json), then env, then 'Open'.
// Case-normalises against the OWNERS enum so a roster entry of "IMan"
// resolves to the canonical "Iman".
export function canonicalizeOwner(raw: string | undefined | null): Owner | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const match = OWNERS.find((o) => o.toLowerCase() === lower);
  return match ?? null;
}

async function ownerForCtx(ctx: Context): Promise<Owner> {
  const tgId = ctx.from?.id;
  if (tgId != null) {
    // Supabase team_members is the canonical roster post-2026-05-23 (doc 713
    // follow-up). Hit it first - it's the single source of truth for the
    // unified tracker and avoids the GitHub team.json staleness class of bug.
    const fromSupabase = await tgIdToOwnerSupabase(tgId);
    if (fromSupabase) return fromSupabase;
    // GitHub team.json fallback - kept until allowlist + admin + chats also
    // migrate to Supabase (the deeper follow-up). For users not in Supabase
    // yet, this still resolves correctly.
    const view = await rosterView();
    const rosterOwner = canonicalizeOwner(view.ownerByTgId.get(tgId));
    if (rosterOwner) return rosterOwner;
  }
  const envOwner = canonicalizeOwner(USER_NAMES[String(tgId ?? '')]);
  return envOwner ?? 'Open';
}

function callerDisplayName(ctx: Context): string {
  return ctx.from?.first_name ?? ctx.from?.username ?? `user:${ctx.from?.id ?? '?'}`;
}

function isAdmin(ctx: Context): boolean {
  return ADMIN_IDS.has(String(ctx.from?.id ?? ''));
}

function formatItem(item: ActionItem): string {
  const flags = [item.important && '!', item.urgent && '*'].filter(Boolean).join('');
  return `[${item.status}] (${item.owner}) #${item.id} ${item.title}${item.due ? ` - due ${item.due}` : ''}${flags ? ` ${flags}` : ''}`;
}

function listGrouped(items: ActionItem[]): string {
  const open = items.filter((i) => i.status !== 'DONE');
  if (open.length === 0) return 'no open items';
  const byOwner = new Map<Owner, ActionItem[]>();
  for (const item of open) {
    const arr = byOwner.get(item.owner) ?? [];
    arr.push(item);
    byOwner.set(item.owner, arr);
  }
  const sections: string[] = [];
  for (const owner of OWNERS) {
    const arr = byOwner.get(owner);
    if (!arr || arr.length === 0) continue;
    sections.push(`${owner}:\n${arr.map((i) => `  ${formatItem(i)}`).join('\n')}`);
  }
  return sections.join('\n\n');
}

function findItemById(items: ActionItem[], id: string): ActionItem | undefined {
  return items.find((i) => i.id === id);
}

function updateStatus(items: ActionItem[], id: string, status: ActionStatus, by: string, notes?: string): ActionItem | null {
  const item = findItemById(items, id);
  if (!item) return null;
  item.status = status;
  item.updatedAt = new Date().toISOString();
  if (status === 'DONE') {
    item.completedAt = item.updatedAt;
    item.completedBy = by;
  }
  if (notes && status === 'BLOCKED') {
    item.notes = notes + (item.notes ? `\n\n${item.notes}` : '');
  }
  return item;
}

export async function cmdStart(ctx: Context): Promise<void> {
  await ctx.reply(
    'ZAOcoworkingBot online. Commands:\n\n' +
      'tracker:\n' +
      '  /mine - my open items\n' +
      '  /list [category] - all open items by owner\n' +
      '  /add <title> - create item assigned to me\n' +
      '  /wip <id> - move to in-progress\n' +
      '  /blocked <id> <reason> - mark blocked\n' +
      '  /done <id> - mark done\n' +
      '  /assign <id> <Owner> - reassign\n' +
      '  /ping <name> [#id] [msg] - DM a teammate (e.g. /ping zaal #45 urgent)\n' +
      '  /setdue <id> <YYYY-MM-DD> - set due date (or "clear")\n' +
      '  /setnote <id> <text> - replace notes (or "append: <text>")\n' +
      '  /setprio <id> <P1|P2|P3> - set priority\n' +
      '  /daily - admin: post digest of open items\n\n' +
      'team (admin):\n' +
      '  /team - show roster\n' +
      '  /adduser <tg_id> <Name> [admin] - add member, no restart\n' +
      '  /addchat - allow CURRENT group chat\n' +
      '  /reload - force-refresh roster from github\n\n' +
      'model / keys:\n' +
      '  /providers - list available LLM providers\n' +
      '  /mymodel - show my current provider/model\n' +
      '  /setmodel <provider> <model> - switch\n' +
      '  /setkey <provider> <key> - DM only, BYOK\n' +
      '  /clearkey <provider> - drop BYOK',
  );
}

export async function cmdMine(ctx: Context): Promise<void> {
  const { data } = await fetchActions();
  const me = await ownerForCtx(ctx);
  const mine = data.items.filter((i) => (i.owner === me || i.owner === 'Both') && i.status !== 'DONE');
  if (mine.length === 0) {
    await ctx.reply(`no open items for ${me}`);
    return;
  }
  await ctx.reply(`${me} open (${mine.length}):\n${mine.map(formatItem).join('\n')}`);
}

const STATUS_ORDER: Record<ActionStatus, number> = { WIP: 0, BLOCKED: 1, TODO: 2, DONE: 3 };

// v2.19 - /list with no args shows a compact summary + tappable owner/status
// filters instead of dumping every open item. A 100+ task list as one wall is
// unusable in Telegram; drill-down keeps each reply short.
function buildListSummary(items: ActionItem[]): { text: string; keyboard: InlineKeyboard } {
  const open = items.filter((i) => i.status !== 'DONE');
  const todo = open.filter((i) => i.status === 'TODO').length;
  const wip = open.filter((i) => i.status === 'WIP').length;
  const blocked = open.filter((i) => i.status === 'BLOCKED').length;
  const kb = new InlineKeyboard();
  let col = 0;
  for (const owner of OWNERS) {
    const n = open.filter((i) => i.owner === owner).length;
    if (n === 0) continue;
    kb.text(`${owner} ${n}`, `list:o:${owner}`);
    if (++col % 2 === 0) kb.row();
  }
  if (col % 2 !== 0) kb.row();
  if (wip > 0) kb.text(`WIP ${wip}`, 'list:s:WIP');
  if (blocked > 0) kb.text(`Blocked ${blocked}`, 'list:s:BLOCKED');
  kb.text('All', 'list:all');
  return {
    text: `${open.length} open  -  ${todo} todo / ${wip} wip / ${blocked} blocked\n\ntap to drill in:`,
    keyboard: kb,
  };
}

function renderOwnerSlice(items: ActionItem[], owner: Owner): string {
  const slice = items
    .filter((i) => i.status !== 'DONE' && i.owner === owner)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  if (slice.length === 0) return `no open items for ${owner}`;
  return `${owner} - ${slice.length} open:\n${slice.map(formatItem).join('\n')}`;
}

function renderStatusSlice(items: ActionItem[], status: ActionStatus): string {
  const slice = items.filter((i) => i.status === status);
  if (slice.length === 0) return `no ${status} items`;
  return `${status} - ${slice.length}:\n${slice.map(formatItem).join('\n')}`;
}

export async function cmdList(ctx: Context, args: string): Promise<void> {
  const { data } = await fetchActions();
  const cat = args.trim();
  if (!cat) {
    const { text, keyboard } = buildListSummary(data.items);
    await ctx.reply(text, { reply_markup: keyboard });
    return;
  }
  // explicit filter: an owner name, or a category substring
  const owner = canonicalizeOwner(cat);
  if (owner) {
    await ctx.reply(renderOwnerSlice(data.items, owner));
    return;
  }
  const items = data.items.filter((i) => i.category.toLowerCase().includes(cat.toLowerCase()));
  await ctx.reply(`open in "${cat}":\n${listGrouped(items)}`);
}

// /now - top 5 "do these now" for the caller (Phase J, doc 768).
//
// Composite ranking matches the web FocusWidget so the same task is
// surfaced regardless of which entry point the user picks. Expedite
// always first, then stale (no activity 5+ days), overdue, P1 in WIP,
// pending reviews (lead-only).
//
// Each row carries the /todo/<id> permalink (Phase H) so the user can
// tap straight from Telegram into the web TaskRoom slide-in.
export async function cmdNow(ctx: Context, _args: string): Promise<void> {
  const me = await ownerForCtx(ctx);
  const meLower = String(me).toLowerCase();
  const isLead = meLower === 'zaal' || meLower === 'iman' || meLower === 'shawn';

  const { data } = await fetchActions();
  type FocusRow = { id: string; title: string; status: string; reasons: string[]; score: number; owner: string };
  const todayMs = Date.now();

  function staleDays(it: ActionItem): number {
    const updated = new Date(it.updatedAt).getTime();
    return Math.floor((todayMs - updated) / 86400000);
  }

  function ageDays(it: ActionItem): number {
    const created = new Date(it.createdAt).getTime();
    return Math.floor((todayMs - created) / 86400000);
  }

  function parseDue(raw: string): number | null {
    const m = String(raw ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) return null;
    const d = new Date(`${m[1]}T00:00:00Z`).getTime();
    return Number.isFinite(d) ? d : null;
  }

  const scored: FocusRow[] = [];
  for (const it of data.items) {
    if (it.status === 'DONE') continue;
    const o = String(it.owner ?? '').toLowerCase();
    const mine = o === meLower || o === 'both' || (!o || o === 'open');

    const reasons: string[] = [];
    let score = 0;

    if ((it as ActionItem & { serviceClass?: string }).serviceClass === 'Expedite') {
      reasons.push('Expedite');
      score += 1000;
    }

    if (mine && staleDays(it) > 5) {
      reasons.push('Stale');
      score += 500 + ageDays(it);
    }

    if (mine) {
      const due = parseDue(it.due);
      if (due && due < todayMs) {
        reasons.push('Overdue');
        const daysLate = Math.floor((todayMs - due) / 86400000);
        score += 400 + Math.min(daysLate, 100);
      }
    }

    if (mine && it.priority === 'P1' && (it.status === 'WIP' || it.status === 'BLOCKED')) {
      reasons.push('P1 WIP');
      score += 200;
    }

    if (isLead) {
      const pending = (it.updates ?? []).filter((u) => u.reviewStatus === 'pending').length;
      if (pending > 0) {
        reasons.push(`${pending} review`);
        score += 300 + pending * 10;
      }
    }

    if (reasons.length === 0) continue;
    scored.push({ id: it.id, title: it.title, status: it.status, reasons, score, owner: String(it.owner) });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5);

  if (top.length === 0) {
    await ctx.reply(`nothing urgent for ${me} - clean board`);
    return;
  }

  const lines = top.map((r, i) => {
    const tags = r.reasons.join(', ');
    return `${i + 1}. #${r.id} (${r.owner}) [${tags}] ${r.title}\n   ${taskUrl(r.id)}`;
  });
  await ctx.reply(`Top ${top.length} for ${me}:\n\n${lines.join('\n\n')}`);
}

// v2.19 - inline-keyboard taps from the /list summary. Returns true if handled.
export async function handleListCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('list:')) return false;
  const { data: actions } = await fetchActions();
  let text: string;
  if (data === 'list:all') {
    const open = actions.items.filter((i) => i.status !== 'DONE');
    text = `all open items (${open.length}):\n${listGrouped(actions.items)}`;
  } else if (data.startsWith('list:o:')) {
    text = renderOwnerSlice(actions.items, data.slice(7) as Owner);
  } else if (data.startsWith('list:s:')) {
    text = renderStatusSlice(actions.items, data.slice(7) as ActionStatus);
  } else {
    return false;
  }
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.reply(text);
  return true;
}

// v2.15 - now accepts an optional ownerOverride. When the LLM emits a
// json-suggest with {"op":"add", "owner":"Iman", ...}, executeSuggestion
// passes that through so "add task for Iman" actually assigns to Iman
// instead of falling back to the caller's owner. Iman bug report
// 2026-05-18 09:26 "I asked bot to add task for IMan it added it as open".
export async function cmdAdd(
  ctx: Context,
  args: string,
  ownerOverride?: Owner,
  // Extras let the NL extractor pass full metadata in one shot (doc 713
  // follow-up 2026-05-23). Without these, the LLM was emitting separate
  // setdue / setprio / setnote ops on a random existing task id because the
  // add op schema only had title/owner/category.
  extras?: { due?: string; priority?: Priority; notes?: string; category?: string },
): Promise<void> {
  const raw = args.trim();
  if (!raw) {
    await ctx.reply('usage: /add <title> (tip: prepend #brand-slug to tag a brand, e.g. /add #zaostock book the parklet)');
    return;
  }
  // #brand-slug tokens in the body resolve to ecosystem brands and are
  // stripped from the title (e.g. "/add #zaostock book the parklet" lands
  // with brands=["ZAOstock"] and title="book the parklet").
  const { brands, cleaned } = parseBrandHashtags(raw);
  const title = cleaned;
  if (!title) {
    await ctx.reply('usage: /add <title> - a hashtag alone is not a task, give me a title');
    return;
  }
  const me = ownerOverride ?? (await ownerForCtx(ctx));
  const by = callerDisplayName(ctx);
  const result = await mutateActions(async (data) => {
    const item = makeActionItem(
      {
        title,
        owner: me,
        createdBy: by,
        brands,
        category: extras?.category,
        priority: extras?.priority,
        notes: extras?.notes,
        due: extras?.due,
      },
      data.items,
    );
    data.items.push(item);
    return {
      data,
      commitMessage: `bot: add #${item.id} (${me}) ${item.title}`,
      result: item,
    };
  });
  if (result) {
    const brandStr = brands.length ? ` [${brands.join(', ')}]` : '';
    const dueStr = result.due ? ` (due ${result.due})` : '';
    const prioStr = extras?.priority && extras.priority !== 'P2' ? ` ${extras.priority}` : '';
    // Doc 764 F4: makeActionItem now defaults new items to TRIAGE so a
    // lead can route them. Surface that in the reply so the user knows
    // the item is in the inbox rather than the active board.
    const triageNote = result.status === 'TRIAGE'
      ? ` - in triage, lead will route`
      : '';
    // Phase H: include permalink so the recipient can tap straight to
    // the task in the web UI. PUBLIC_BASE_URL env override allows for
    // staging / local-dev usage.
    const url = taskUrl(result.id);
    await ctx.reply(`added #${result.id} (${result.owner})${brandStr}${prioStr}${dueStr}: ${result.title}${triageNote}\n${url}`);
    fireBonfire('add', result, ctx);
  }
}

// Phase H: build the public /todo/<id> permalink for bot replies so
// recipients can tap straight to the task. PUBLIC_BASE_URL env
// overrides the default for staging / local-dev usage.
function taskUrl(id: string): string {
  const base = (process.env.PUBLIC_BASE_URL || 'https://www.thezao.xyz').replace(/\/+$/, '');
  return `${base}/todo/${encodeURIComponent(id)}`;
}

// v2.16 - batch add. When a user pastes multiple todos in one message the LLM
// emits a json-suggest ARRAY; this writes every item in ONE commit and sends
// ONE reply, instead of N commits + N messages (and instead of the raw
// json-suggest block leaking to chat - the bug this fixes).
export async function cmdAddBatch(
  ctx: Context,
  entries: Array<{ title: string; owner?: Owner }>,
): Promise<void> {
  const clean = entries
    .map((e) => ({ title: e.title.trim(), owner: e.owner }))
    .filter((e) => e.title.length > 0);
  if (clean.length === 0) {
    await ctx.reply('nothing to add - no titles in that batch.');
    return;
  }
  const fallbackOwner = await ownerForCtx(ctx);
  const by = callerDisplayName(ctx);
  const created = await mutateActions(async (data) => {
    const items: ActionItem[] = [];
    for (const e of clean) {
      // Parse #brand hashtags from each batch entry's title.
      const { brands, cleaned } = parseBrandHashtags(e.title);
      const title = cleaned || e.title;
      const item = makeActionItem(
        { title, owner: e.owner ?? fallbackOwner, createdBy: by, brands },
        data.items,
      );
      data.items.push(item);
      items.push(item);
    }
    return {
      data,
      commitMessage: `bot: add ${items.length} items (batch)`,
      result: items,
    };
  });
  if (created && created.length > 0) {
    // Phase H: include /todo/<id> permalinks so each row in the batch
    // reply is tappable. Kept tight so a 10-item batch doesn't explode
    // the message - one URL per line, no extra blanks.
    const lines = created.map((i) => `#${i.id} (${i.owner}): ${i.title} ${taskUrl(i.id)}`);
    await ctx.reply(
      `added ${created.length} item${created.length === 1 ? '' : 's'}:\n${lines.join('\n')}`,
    );
    for (const item of created) fireBonfire('add', item, ctx);
  }
}

async function applyStatusCommand(ctx: Context, args: string, status: ActionStatus, label: string): Promise<void> {
  const trimmed = args.trim();
  const idMatch = trimmed.match(/^(\d+)\s*(.*)$/);
  if (!idMatch) {
    await ctx.reply(`usage: /${label} <id>${status === 'BLOCKED' ? ' <reason>' : ''}`);
    return;
  }
  const [, id, rest] = idMatch;
  const reason = rest.trim() || undefined;
  if (status === 'BLOCKED' && !reason) {
    await ctx.reply('usage: /blocked <id> <reason>');
    return;
  }
  const by = callerDisplayName(ctx);
  const result = await mutateActions(async (data) => {
    const item = updateStatus(data.items, id, status, by, reason);
    if (!item) return null;
    return {
      data,
      commitMessage: `bot: ${label} #${id} by ${by}`,
      result: item,
    };
  });
  if (result) {
    // Phase H: append permalink so status-change DMs are tappable.
    await ctx.reply(`${label} #${result.id}: ${result.title}\n${taskUrl(result.id)}`);
    // v2.8 - notify the owner if someone else updated their item.
    // v2.14 - pass tg_id (not display name) so self-skip actually works.
    if (status === 'DONE' || status === 'BLOCKED' || status === 'WIP') {
      notifyStatusChange(ctx.api, result, status, ctx.from?.id, by, reason).catch(() => { /* best-effort */ });
    }
    // doc 669 Phase 1 - emit to ZABAL bonfire (no-op if disabled)
    const op = status === 'WIP' ? 'wip' : status === 'BLOCKED' ? 'blocked' : 'done';
    fireBonfire(op, result, ctx, { reason });
  } else {
    await ctx.reply(`no item #${id}`);
  }
}

export async function cmdWip(ctx: Context, args: string): Promise<void> {
  await applyStatusCommand(ctx, args, 'WIP', 'wip');
}

export async function cmdBlocked(ctx: Context, args: string): Promise<void> {
  await applyStatusCommand(ctx, args, 'BLOCKED', 'blocked');
}

export async function cmdDone(ctx: Context, args: string): Promise<void> {
  await applyStatusCommand(ctx, args, 'DONE', 'done');
}

// /ping <name> [#id] [message] - DM a teammate via the bot.
// Resolves target tg_id via Supabase team_members first, then GitHub roster.
// Token order is flexible: "/ping zaal #45 urgent" == "/ping zaal urgent #45".
// `urgent` tag bolds the DM. If #id resolves to a known task, includes title.
// Examples:
//   /ping zaal                   -> "Iman pinged you"
//   /ping zaal can you check     -> "Iman pinged you: can you check"
//   /ping zaal #45               -> "Iman pinged you re #45: <task title>"
//   /ping zaal #45 urgent        -> "Iman pinged you [URGENT] re #45: <title>"
export async function cmdPing(ctx: Context, args: string): Promise<void> {
  const raw = args.trim();
  if (!raw) {
    await ctx.reply(
      'usage: /ping <name> [#id] [message]\n' +
        'examples:\n' +
        '  /ping zaal #45\n' +
        '  /ping zaal can you check this\n' +
        '  /ping zaal urgent #45',
    );
    return;
  }
  const tokens = raw.split(/\s+/);
  const rawName = tokens.shift() ?? '';
  const target = canonicalizeOwner(rawName);
  if (!target || target === 'Both' || target === 'Open') {
    await ctx.reply(
      `cannot ping "${rawName}". valid people: ${OWNERS.filter((o) => o !== 'Both' && o !== 'Open').join(', ')}.`,
    );
    return;
  }
  // Tokens after the name: #id, urgent flag, or free-text message bits.
  let taskId: string | null = null;
  let urgent = false;
  const msgTokens: string[] = [];
  for (const t of tokens) {
    const idMatch = t.match(/^#?(\d+)$/);
    if (idMatch && !taskId) {
      taskId = idMatch[1];
      continue;
    }
    if (t.toLowerCase() === 'urgent' || t === '!') {
      urgent = true;
      continue;
    }
    msgTokens.push(t);
  }
  const message = msgTokens.join(' ').trim();

  // Resolve target tg_id - Supabase first, GitHub roster fallback.
  let tgId = await ownerToTgIdSupabase(target);
  if (tgId == null) {
    const view = await rosterView();
    for (const [id, ownerStr] of view.ownerByTgId) {
      if (canonicalizeOwner(ownerStr) === target) {
        tgId = id;
        break;
      }
    }
  }
  if (tgId == null) {
    await ctx.reply(
      `no telegram_id mapped for ${target}. add via /adduser <tg_id> ${target}.`,
    );
    return;
  }

  // Resolve task title if id was given (best-effort - missing is non-fatal).
  let taskTitle: string | null = null;
  if (taskId) {
    try {
      const { data } = await fetchActions();
      const item = data.items.find((i) => i.id === taskId);
      if (item) taskTitle = item.title;
    } catch {
      // ignore - render without title
    }
  }

  const from = callerDisplayName(ctx);
  const tag = urgent ? ' [URGENT]' : '';
  const headerLines: string[] = [];
  if (taskId && taskTitle) {
    headerLines.push(`${from} pinged you${tag} re #${taskId}: ${taskTitle}`);
  } else if (taskId) {
    headerLines.push(`${from} pinged you${tag} re #${taskId} (task not found)`);
  } else {
    headerLines.push(`${from} pinged you${tag}`);
  }
  if (message) headerLines.push(message);
  const dmText = headerLines.join('\n');

  try {
    await ctx.api.sendMessage(tgId, dmText);
    await ctx.reply(
      `pinged ${target}${taskId ? ` re #${taskId}` : ''}${urgent ? ' (urgent)' : ''}`,
    );
  } catch (err) {
    await ctx.reply(`could not DM ${target}: ${(err as Error).message.slice(0, 100)}`);
  }
}

export async function cmdAssign(ctx: Context, args: string): Promise<void> {
  const m = args.trim().match(/^(\d+)\s+(\w+)$/);
  if (!m) {
    await ctx.reply(`usage: /assign <id> <${OWNERS.join('|')}>`);
    return;
  }
  const [, id, ownerRaw] = m;
  if (!(OWNERS as readonly string[]).includes(ownerRaw)) {
    await ctx.reply(`unknown owner ${ownerRaw}. valid: ${OWNERS.join(', ')}`);
    return;
  }
  const owner = ownerRaw as Owner;
  const by = callerDisplayName(ctx);
  let previousOwner: Owner | undefined;
  const result = await mutateActions(async (data) => {
    const item = data.items.find((i) => i.id === id);
    if (!item) return null;
    previousOwner = item.owner;
    item.owner = owner;
    item.updatedAt = new Date().toISOString();
    return {
      data,
      commitMessage: `bot: assign #${id} -> ${owner} by ${by}`,
      result: item,
    };
  });
  if (result) {
    await ctx.reply(`#${result.id} -> ${result.owner}: ${result.title}`);
    // v2.8 - notify the new owner instantly
    notifyAssigned(ctx.api, result, by).catch(() => { /* best-effort */ });
    // doc 669 Phase 1 - bonfire emit with previous owner edge
    fireBonfire('assign', result, ctx, { previousOwner });
  } else {
    await ctx.reply(`no item #${id}`);
  }
}

// v2.10 - setfield commands. Triggered by Iman bug: bot's concierge LLM fabricated
// a "file doesn't exist" excuse when asked "update rent bill due date" because no
// slash command for due-date edits existed. Now they do.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function cmdSetDue(ctx: Context, args: string): Promise<void> {
  const m = args.trim().match(/^(\d+)\s+(.+)$/);
  if (!m) {
    await ctx.reply('usage: /setdue <id> <YYYY-MM-DD>  (or "clear" to remove)');
    return;
  }
  const [, id, rawDate] = m;
  const value = rawDate.trim();
  const clearing = value.toLowerCase() === 'clear' || value === '-';
  if (!clearing && !ISO_DATE.test(value)) {
    await ctx.reply('date must be YYYY-MM-DD format (e.g. 2026-05-28). got: ' + value);
    return;
  }
  const by = callerDisplayName(ctx);
  const newDue = clearing ? '' : value;
  let previousDue: string | undefined;
  const result = await mutateActions(async (data) => {
    const item = findItemById(data.items, id);
    if (!item) return null;
    previousDue = item.due || '';
    const prev = item.due || '(none)';
    item.due = newDue;
    item.updatedAt = new Date().toISOString();
    return {
      data,
      commitMessage: `bot: setdue #${id} ${prev} -> ${newDue || '(cleared)'} by ${by}`,
      result: item,
    };
  });
  if (result) {
    await ctx.reply(`#${result.id} due ${result.due ? '-> ' + result.due : 'cleared'}: ${result.title}`);
    fireBonfire('setdue', result, ctx, { previousDue });
  } else {
    await ctx.reply(`no item #${id}`);
  }
}

export async function cmdSetNote(ctx: Context, args: string): Promise<void> {
  const m = args.trim().match(/^(\d+)\s+([\s\S]+)$/);
  if (!m) {
    await ctx.reply('usage: /setnote <id> <text>  (prefix text with "append: " to add to existing notes)');
    return;
  }
  const [, id, rawText] = m;
  const text = rawText.trim();
  const isAppend = /^append:\s*/i.test(text);
  const newContent = isAppend ? text.replace(/^append:\s*/i, '') : text;
  if (!newContent) {
    await ctx.reply('note text cannot be empty');
    return;
  }
  const by = callerDisplayName(ctx);
  const result = await mutateActions(async (data) => {
    const item = findItemById(data.items, id);
    if (!item) return null;
    if (isAppend && item.notes) {
      item.notes = `${item.notes}\n\n${newContent}`;
    } else {
      item.notes = newContent;
    }
    item.updatedAt = new Date().toISOString();
    return {
      data,
      commitMessage: `bot: ${isAppend ? 'append-note' : 'set-note'} #${id} by ${by}`,
      result: item,
    };
  });
  if (result) {
    await ctx.reply(`#${result.id} notes ${isAppend ? 'appended' : 'set'}: ${result.title}`);
    fireBonfire('setnote', result, ctx);
  } else {
    await ctx.reply(`no item #${id}`);
  }
}

export async function cmdSetPrio(ctx: Context, args: string): Promise<void> {
  const m = args.trim().match(/^(\d+)\s+(P[123])$/i);
  if (!m) {
    await ctx.reply('usage: /setprio <id> <P1|P2|P3>');
    return;
  }
  const [, id, rawPrio] = m;
  const prio = rawPrio.toUpperCase() as Priority;
  if (!PRIORITIES.includes(prio)) {
    await ctx.reply('priority must be P1, P2, or P3');
    return;
  }
  const by = callerDisplayName(ctx);
  let previousPriority: Priority | undefined;
  const result = await mutateActions(async (data) => {
    const item = findItemById(data.items, id);
    if (!item) return null;
    previousPriority = item.priority;
    item.priority = prio;
    item.updatedAt = new Date().toISOString();
    return {
      data,
      commitMessage: `bot: setprio #${id} ${previousPriority} -> ${prio} by ${by}`,
      result: item,
    };
  });
  if (result) {
    await ctx.reply(`#${result.id} priority -> ${result.priority}: ${result.title}`);
    fireBonfire('setprio', result, ctx, { previousPriority });
  } else {
    await ctx.reply(`no item #${id}`);
  }
}

export async function cmdDaily(ctx: Context): Promise<void> {
  if (!isAdmin(ctx)) {
    await ctx.reply('admin only');
    return;
  }
  const { data } = await fetchActions();
  await ctx.reply(`Daily digest:\n${listGrouped(data.items)}`);
}
