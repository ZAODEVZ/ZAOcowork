// v2.8 - cron-driven proactive DMs.
// Mirrors the ZOE scheduler pattern (bot/src/zoe/scheduler.ts in ZAOOS):
// node-cron schedules + per-trigger sentinel file for idempotency across
// service restarts within the same day.
//
// Triggers (all America/New_York timezone):
//   06:00 daily   morning_digest  - each member their open items + WIP + due-today
//   17:00 daily   eod_check        - members with WIP items: "any of these landing today?"
//   09:00 daily   stale_alert      - per-item: TODO age > 14 days, ping owner (one ping per item per week)

import type { Bot } from 'grammy';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error - node-cron has no bundled types
import cron from 'node-cron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { fetchActions } from './actions-store';
import { sendDM } from './notifications';
import { COWORK_PATHS } from './paths';
import { rosterView } from './roster';
import type { ActionItem, Owner } from './types';

const TZ = 'America/New_York';
const STALE_DAYS = 14;
const STALE_REPING_DAYS = 7;

async function alreadyFired(trigger: string): Promise<boolean> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const sentinel = join(COWORK_PATHS.sentinels, `${trigger}-${today}.flag`);
  try { await fs.access(sentinel); return true; } catch { return false; }
}

async function markFired(trigger: string): Promise<void> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  await fs.mkdir(COWORK_PATHS.sentinels, { recursive: true });
  await fs.writeFile(join(COWORK_PATHS.sentinels, `${trigger}-${today}.flag`), new Date().toISOString(), 'utf8');
}

function isoDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

function dueToday(item: ActionItem): boolean {
  if (!item.due) return false;
  // due can be free-form ("Wed session", "2026-05-08"). Only YYYY-MM-DD matches.
  return /^\d{4}-\d{2}-\d{2}$/.test(item.due) && item.due === isoDate(new Date());
}

function dueThisWeek(item: ActionItem): boolean {
  if (!item.due || !/^\d{4}-\d{2}-\d{2}$/.test(item.due)) return false;
  const due = new Date(item.due + 'T00:00:00');
  const now = Date.now();
  return due.getTime() - now < 7 * 86400_000 && due.getTime() > now;
}

function itemsForOwner(items: ActionItem[], owner: Owner): ActionItem[] {
  return items.filter((i) => (i.owner === owner || i.owner === 'Both') && i.status !== 'DONE');
}

function fmtItemShort(i: ActionItem): string {
  const flags = [i.important && '!', i.urgent && '*'].filter(Boolean).join('');
  return `[${i.status}] #${i.id} ${i.title}${i.due ? ` - due ${i.due}` : ''}${flags ? ` ${flags}` : ''}`;
}

async function runMorningDigest(bot: Bot): Promise<void> {
  if (await alreadyFired('morning-digest')) return;
  const { data } = await fetchActions();
  const view = await rosterView();
  for (const [tgId, ownerValue] of view.ownerByTgId.entries()) {
    const mine = itemsForOwner(data.items, ownerValue as Owner);
    if (mine.length === 0) continue; // skip people with nothing open
    const wip = mine.filter((i) => i.status === 'WIP');
    const today = mine.filter(dueToday);
    const week = mine.filter(dueThisWeek);
    const lines: string[] = [
      `morning - ${view.nameByTgId.get(tgId) ?? ownerValue}`,
      '',
      `${mine.length} open (${wip.length} WIP)${today.length ? `, ${today.length} due today` : ''}${week.length ? `, ${week.length} due this week` : ''}`,
      '',
      'top 5:',
      ...mine.slice(0, 5).map((i) => `  ${fmtItemShort(i)}`),
      '',
      '/mine for full list. /notify off morning_digest to mute.',
    ];
    await sendDM(bot.api, tgId, 'morning_digest', lines.join('\n'));
  }
  await markFired('morning-digest');
}

async function runEodCheck(bot: Bot): Promise<void> {
  if (await alreadyFired('eod-check')) return;
  const { data } = await fetchActions();
  const view = await rosterView();
  for (const [tgId, ownerValue] of view.ownerByTgId.entries()) {
    const wip = itemsForOwner(data.items, ownerValue as Owner).filter((i) => i.status === 'WIP');
    if (wip.length === 0) continue;
    const lines: string[] = [
      `end of day - ${view.nameByTgId.get(tgId) ?? ownerValue}`,
      '',
      `${wip.length} WIP. landing any today?`,
      '',
      ...wip.slice(0, 8).map((i) => `  ${fmtItemShort(i)}`),
      '',
      '/done <id> to close. /notify off eod_check to mute.',
    ];
    await sendDM(bot.api, tgId, 'eod_check', lines.join('\n'));
  }
  await markFired('eod-check');
}

interface StalePings {
  [itemId: string]: string; // ISO date of last ping
}

// Phase J 4h-nudge (doc 768 follow-up).
// Every 4 hours during waking ET (08:00-22:00) DM each lead their #1
// "do this now" task with a /todo permalink. Per Zaal's call:
//   - leads only: Zaal / Iman / Shawn
//   - no dedup: same #1 next cycle still gets pinged. Steady reminder.
//   - quiet hours hardcoded ET 22-08 for v1; per-user /quiet is a followup.
const NUDGE_LEADS = new Set(['zaal', 'iman', 'shawn']);
const NUDGE_WAKING_START = 8; // 08:00 ET inclusive
const NUDGE_WAKING_END = 22; // 22:00 ET exclusive

function inWakingHoursET(): boolean {
  const hourStr = new Date().toLocaleString('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    hour12: false,
  });
  const h = Number(hourStr);
  if (!Number.isFinite(h)) return false;
  return h >= NUDGE_WAKING_START && h < NUDGE_WAKING_END;
}

function topOneForOwner(items: ActionItem[], owner: Owner, isLead: boolean): ActionItem | null {
  const ownerLower = String(owner).toLowerCase();
  const todayMs = Date.now();

  function staleDays(it: ActionItem): number {
    const acts = it.activity ?? [];
    const latest = Math.max(
      acts.length ? new Date(acts[acts.length - 1].createdAt).getTime() : 0,
      new Date(it.updatedAt).getTime(),
    );
    return Math.floor((todayMs - latest) / 86400000);
  }
  function ageDays(it: ActionItem): number {
    return Math.floor((todayMs - new Date(it.createdAt).getTime()) / 86400000);
  }
  function parseDue(raw: string): number | null {
    const m = String(raw ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) return null;
    const d = new Date(`${m[1]}T00:00:00Z`).getTime();
    return Number.isFinite(d) ? d : null;
  }

  let best: { task: ActionItem; score: number } | null = null;
  for (const it of items) {
    if (it.status === 'DONE') continue;
    const o = String(it.owner ?? '').toLowerCase();
    const mine = o === ownerLower || o === 'both' || (!o || o === 'open');

    let score = 0;
    if ((it as ActionItem & { serviceClass?: string }).serviceClass === 'Expedite') score += 1000;
    if (mine && staleDays(it) > 5) score += 500 + ageDays(it);
    if (mine) {
      const due = parseDue(it.due);
      if (due && due < todayMs) {
        const daysLate = Math.floor((todayMs - due) / 86400000);
        score += 400 + Math.min(daysLate, 100);
      }
    }
    if (mine && it.priority === 'P1' && (it.status === 'WIP' || it.status === 'BLOCKED')) score += 200;
    if (isLead) {
      const pending = (it.updates ?? []).filter((u) => u.reviewStatus === 'pending').length;
      if (pending > 0) score += 300 + pending * 10;
    }
    if (score === 0) continue;
    if (!best || score > best.score) best = { task: it, score };
  }
  return best?.task ?? null;
}

function nudgeUrl(id: string): string {
  const base = (process.env.PUBLIC_BASE_URL || 'https://www.thezao.xyz').replace(/\/+$/, '');
  return `${base}/todo/${encodeURIComponent(id)}`;
}

async function runFourHourNudge(bot: Bot): Promise<void> {
  if (!inWakingHoursET()) {
    console.log('[scheduler] 4h-nudge: outside waking hours, skipping');
    return;
  }
  const { data } = await fetchActions();
  const view = await rosterView();
  let sent = 0;
  let skipped = 0;
  for (const [tgId, ownerValue] of view.ownerByTgId.entries()) {
    const lower = String(ownerValue).toLowerCase();
    if (!NUDGE_LEADS.has(lower)) continue;
    const top = topOneForOwner(data.items, ownerValue as Owner, true /* isLead */);
    if (!top) {
      skipped++;
      continue;
    }
    const reasonBits: string[] = [];
    if ((top as ActionItem & { serviceClass?: string }).serviceClass === 'Expedite') reasonBits.push('Expedite');
    if (top.priority === 'P1') reasonBits.push('P1');
    if (top.status === 'BLOCKED') reasonBits.push('Blocked');
    const tag = reasonBits.length ? ` [${reasonBits.join(', ')}]` : '';
    const url = nudgeUrl(top.id);
    const lines = [
      `do now${tag}`,
      '',
      `#${top.id} ${top.title}`,
      `${top.status} - owner ${top.owner}`,
      '',
      url,
      '',
      `/done ${top.id} when shipped. /notify off four_hour_nudge to mute.`,
    ];
    await sendDM(bot.api, tgId, 'four_hour_nudge', lines.join('\n'));
    sent++;
  }
  console.log(`[scheduler] 4h-nudge: sent ${sent}, skipped ${skipped} (no urgent)`);
}

async function runStaleAlert(bot: Bot): Promise<void> {
  if (await alreadyFired('stale-alert')) return;
  const stalePath = join(COWORK_PATHS.home, 'stale-pings.json');
  let pings: StalePings = {};
  try { pings = JSON.parse(await fs.readFile(stalePath, 'utf8')) as StalePings; } catch { /* ignore */ }
  const { data } = await fetchActions();
  const view = await rosterView();
  const now = Date.now();
  for (const item of data.items) {
    if (item.status !== 'TODO') continue;
    const created = new Date(item.createdAt).getTime();
    const ageDays = (now - created) / 86400_000;
    if (ageDays < STALE_DAYS) continue;
    const lastPing = pings[item.id] ? new Date(pings[item.id]).getTime() : 0;
    if (lastPing && (now - lastPing) / 86400_000 < STALE_REPING_DAYS) continue;
    // Find the owner's tg_id
    let tgId: number | null = null;
    for (const [id, ownerValue] of view.ownerByTgId.entries()) {
      if (ownerValue === item.owner) { tgId = id; break; }
    }
    if (!tgId) continue;
    await sendDM(bot.api, tgId, 'stale_alert',
      `stale: #${item.id} has been TODO for ${Math.floor(ageDays)} days\n${item.title}\n\n/wip ${item.id} if moving / /done ${item.id} if shipped / /blocked ${item.id} <reason> if stuck / /notify off stale_alert to mute`,
    );
    pings[item.id] = new Date().toISOString();
  }
  await fs.writeFile(stalePath, JSON.stringify(pings, null, 2), 'utf8');
  await markFired('stale-alert');
}

export function startScheduler(bot: Bot): { stop: () => void } {
  const tasks = [
    cron.schedule('0 6 * * *', () => { runMorningDigest(bot).catch((e) => console.error('[scheduler] morning failed:', (e as Error).message)); }, { timezone: TZ }),
    cron.schedule('0 17 * * *', () => { runEodCheck(bot).catch((e) => console.error('[scheduler] eod failed:', (e as Error).message)); }, { timezone: TZ }),
    cron.schedule('0 9 * * *', () => { runStaleAlert(bot).catch((e) => console.error('[scheduler] stale failed:', (e as Error).message)); }, { timezone: TZ }),
    // Phase J 4h-nudge: every 4h at minute 0 (00:00, 04:00, 08:00, ... 20:00 ET).
    // runFourHourNudge handles the waking-hours window internally so the 00:00
    // / 04:00 firings are no-ops; only 08:00, 12:00, 16:00, 20:00 ET actually
    // DM. That's 4 nudges per active lead per day.
    cron.schedule('0 */4 * * *', () => { runFourHourNudge(bot).catch((e) => console.error('[scheduler] 4h-nudge failed:', (e as Error).message)); }, { timezone: TZ }),
  ];
  console.log(`[scheduler] started ${tasks.length} cron jobs (morning 6am ET, eod 5pm ET, stale 9am ET, 4h-nudge */4 ET 8a-10p)`);
  return { stop: () => { for (const t of tasks) t.stop(); } };
}
