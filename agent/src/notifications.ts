// v2.8 - proactive notification dispatcher.
// Two paths in here:
//   sendDM()  - low-level: respects per-user opt-out + logs delivery
//   notifyAssigned / notifyDone / notifyBlocked / notifyWelcome - the event types

import type { Api } from 'grammy';
import { isNotifyEnabled, type NotifyChannel } from './users';
import type { ActionItem, Owner } from './types';
import { rosterView } from './roster';

/** Send a DM to a single user, gated by their channel opt-out. Best-effort. */
export async function sendDM(
  api: Api,
  tgId: number,
  channel: NotifyChannel,
  text: string,
): Promise<void> {
  const enabled = await isNotifyEnabled(tgId, channel);
  if (!enabled) return;
  try {
    await api.sendMessage(tgId, text);
    console.log(`[notify] sent to ${tgId} channel=${channel} len=${text.length}`);
  } catch (err) {
    console.error(`[notify] send to ${tgId} failed (${channel}):`, (err as Error).message);
  }
}

/** Resolve Owner enum value -> roster member tg_id. Returns null if no match. */
async function tgIdForOwner(owner: Owner): Promise<number | null> {
  if (owner === 'Both' || owner === 'Open') return null;
  const view = await rosterView();
  for (const [tgId, ownerValue] of view.ownerByTgId.entries()) {
    if (ownerValue === owner) return tgId;
  }
  return null;
}

/** New owner gets notified when an item is assigned to them. */
export async function notifyAssigned(api: Api, item: ActionItem, by: string): Promise<void> {
  const tgId = await tgIdForOwner(item.owner);
  if (!tgId) return;
  await sendDM(api, tgId, 'change_events',
    `you've been assigned #${item.id} by ${by}:\n${item.title}${item.due ? `\ndue ${item.due}` : ''}`,
  );
}

/**
 * Item creator + admins get notified on done/blocked from someone else.
 * v2.14 - was building a (broken) display-name -> tg_id reverse lookup off
 * the roster to skip self-notifications, which failed because the caller
 * always passed `first_name` (display) and the roster stores formal names.
 * Now takes the caller's tg_id directly; display name is for the DM body only.
 */
export async function notifyStatusChange(
  api: Api,
  item: ActionItem,
  newStatus: 'DONE' | 'BLOCKED' | 'WIP',
  byTgId: number | undefined,
  byDisplayName: string,
  reason?: string,
): Promise<void> {
  const ownerTgId = await tgIdForOwner(item.owner);
  if (!ownerTgId) return;
  if (byTgId !== undefined && byTgId === ownerTgId) return;
  const verb = newStatus === 'DONE' ? 'closed' : newStatus === 'BLOCKED' ? 'blocked' : 'moved to WIP';
  await sendDM(api, ownerTgId, 'change_events',
    `#${item.id} ${verb} by ${byDisplayName}: ${item.title}${reason ? `\nreason: ${reason}` : ''}`,
  );
}

/** New roster member gets welcomed + the basics on first /adduser. */
export async function notifyNewMember(
  api: Api,
  tgId: number,
  name: string,
  isAdmin: boolean,
): Promise<void> {
  const text = [
    `welcome to the cowork tracker, ${name}.`,
    '',
    'you can now use the bot:',
    '  /mine     - your open items',
    '  /list     - everything on the board',
    '  /add x    - create new item assigned to you',
    '  /done 12  - mark item done',
    '  /providers - choose LLM (default claude max, free)',
    '',
    'or just message me normally - i know the current items.',
    isAdmin ? '\nyou are admin: /adduser /addchat /reload available.' : '',
    '',
    '/notify off morning_digest if you do not want the daily 6am ET summary.',
  ].filter(Boolean).join('\n');
  try {
    await api.sendMessage(tgId, text);
    console.log(`[notify] welcomed new member ${tgId} (${name})`);
  } catch (err) {
    console.error(`[notify] welcome to ${tgId} failed:`, (err as Error).message);
  }
}
