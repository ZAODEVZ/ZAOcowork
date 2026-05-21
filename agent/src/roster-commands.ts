// Admin slash commands for managing the team roster.
// /team               - show current roster
// /adduser <tg_id> <Name> [admin]   - add or update member, commits team.json
// /addchat            - allow the CURRENT chat (must be in a group)
// /reload             - force-refresh roster from github (no restart)

import { Context } from 'grammy';
import { notifyNewMember } from './notifications';
import { addAllowedChat, addOrUpdateMember, forceReloadRoster, loadRoster, rosterView } from './roster';

async function isAdmin(ctx: Context): Promise<boolean> {
  const id = ctx.from?.id;
  if (!id) return false;
  const view = await rosterView();
  return view.adminUserIds.has(id);
}

// v2.14 - was making 3 redundant rosterView() calls and never enumerated the
// chats section. One loadRoster() now, lists both members AND allowlisted chats.
export async function cmdTeam(ctx: Context): Promise<void> {
  const team = await loadRoster();
  const view = await rosterView();
  const lines: string[] = [
    `team (${view.memberCount} members, ${view.chatCount} chats, updated ${team.updatedAt.slice(0, 16)}):`,
    '',
    'members:',
  ];
  for (const [tgId, name] of view.nameByTgId.entries()) {
    const owner = view.ownerByTgId.get(tgId) ?? '?';
    const admin = view.adminUserIds.has(tgId) ? ' admin' : '';
    lines.push(`  ${name} (tg ${tgId}, owner=${owner}${admin})`);
  }
  lines.push('');
  lines.push('chats:');
  if (team.allowed_chats.length === 0) {
    lines.push('  (none allowlisted)');
  } else {
    for (const c of team.allowed_chats) {
      lines.push(`  ${c.title} (id ${c.chat_id})`);
    }
  }
  await ctx.reply(lines.join('\n'));
}

export async function cmdAddUser(ctx: Context, args: string): Promise<void> {
  if (!(await isAdmin(ctx))) {
    await ctx.reply('admin only - ask Zaal or Iman to add you');
    return;
  }
  const m = args.trim().match(/^(\d+)\s+(\S+)(?:\s+(admin))?$/);
  if (!m) {
    await ctx.reply('usage: /adduser <telegram_id> <Name> [admin]\nuser dms @userinfobot to get their id\nexample: /adduser 1234567 Jordan');
    return;
  }
  const [, tgIdRaw, name, adminFlag] = m;
  const tgId = Number(tgIdRaw);
  try {
    const wasAlreadyMember = (await rosterView()).allowedUserIds.has(tgId);
    const member = await addOrUpdateMember({
      name,
      telegram_id: tgId,
      role: adminFlag === 'admin' ? 'lead' : 'worker',
      admin: adminFlag === 'admin',
    });
    await ctx.reply(`added ${member.name} (tg ${member.telegram_id}, owner=${member.owner_value}${member.admin ? ', admin' : ''}). committed to data/team.json. roster reloaded - no restart.`);
    // v2.8 - welcome the new member with a DM (only on first add, not updates)
    if (!wasAlreadyMember) {
      notifyNewMember(ctx.api, tgId, name, !!member.admin).catch(() => { /* best-effort */ });
    }
  } catch (err) {
    await ctx.reply(`failed: ${(err as Error).message.slice(0, 200)}`);
  }
}

export async function cmdAddChat(ctx: Context): Promise<void> {
  if (!(await isAdmin(ctx))) {
    await ctx.reply('admin only');
    return;
  }
  const chatId = ctx.chat?.id;
  if (!chatId || ctx.chat?.type === 'private') {
    await ctx.reply('run this in the group you want to allow');
    return;
  }
  const title = (ctx.chat && 'title' in ctx.chat ? ctx.chat.title : null) ?? `chat:${chatId}`;
  try {
    await addAllowedChat(chatId, title);
    await ctx.reply(`allowed this chat (${chatId} / ${title}). reloaded.`);
  } catch (err) {
    await ctx.reply(`failed: ${(err as Error).message.slice(0, 200)}`);
  }
}

export async function cmdReload(ctx: Context): Promise<void> {
  if (!(await isAdmin(ctx))) {
    await ctx.reply('admin only');
    return;
  }
  try {
    const team = await forceReloadRoster();
    await ctx.reply(`reloaded. ${team.members.length} members, ${team.allowed_chats.length} chats. updated ${team.updatedAt.slice(0, 16)}.`);
  } catch (err) {
    await ctx.reply(`reload failed: ${(err as Error).message.slice(0, 200)}`);
  }
}

/**
 * v2.7 self-onboarding. /whoami works for ANYONE (not allowlist-gated). New
 * users DM the bot, get their telegram id + exact /adduser command to forward
 * to an admin. Admins can also DM /whoami to grab their own id.
 */
export async function cmdWhoami(ctx: Context): Promise<void> {
  const id = ctx.from?.id;
  if (!id) {
    await ctx.reply('cannot read your id from this context');
    return;
  }
  const view = await rosterView();
  const isMember = view.allowedUserIds.has(id);
  const name = ctx.from?.first_name ?? ctx.from?.username ?? 'there';
  if (isMember) {
    const owner = view.ownerByTgId.get(id) ?? '?';
    const admin = view.adminUserIds.has(id) ? ' (admin)' : '';
    await ctx.reply(`hi ${name}\nyour telegram id: ${id}\non roster as: ${owner}${admin}`);
  } else {
    await ctx.reply(
      `hi ${name}\nyour telegram id: ${id}\n\n` +
        `you're NOT on the cowork roster yet. ask Zaal or Iman to DM me:\n` +
        `/adduser ${id} ${name}\n\n` +
        `takes a few seconds, no restart.`,
    );
  }
}
