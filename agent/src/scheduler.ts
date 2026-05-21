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
  ];
  console.log(`[scheduler] started ${tasks.length} cron jobs (morning 6am ET, eod 5pm ET, stale 9am ET)`);
  return { stop: () => { for (const t of tasks) t.stop(); } };
}
