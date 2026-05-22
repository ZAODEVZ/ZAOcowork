// ZAOcoworkingBot v2.5 entry.
// Hermes pattern: grammy polls Telegram, each allowed message spawns the user's
// configured LLM (claude-max/claude-api/openai/minimax) with appendSystemPrompt
// = 5-block Letta memory + actions snapshot. Default provider = claude-max
// (local CLI, Max OAuth, $0 marginal cost).
//
// Slash commands:
//   Action tracker: /start /mine /list /add /wip /blocked /done /assign /daily
//   Model/key:      /setmodel /mymodel /setkey /clearkey /providers
//
// Action mutations write to data/actions.json via Octokit Contents API
// (SHA dance). Suggest-then-confirm flow for conversational extraction.

import { config as loadEnv } from 'dotenv';
loadEnv();

import { Bot, Context } from 'grammy';
import {
  cmdAdd,
  cmdAssign,
  cmdBlocked,
  cmdDaily,
  cmdDone,
  cmdList,
  cmdMine,
  cmdSetDue,
  cmdSetNote,
  cmdSetPrio,
  cmdStart,
  cmdWip,
  handleListCallback,
} from './commands';
import {
  maybeHandleConfirmation,
  maybeStartSuggestionFlow,
} from './extraction';
import { callLLM } from './llm';
import {
  buildMemoryBlocks,
  ensureCoworkHome,
  memoryBlocksToSystemPrompt,
} from './memory';
import { logMessage } from './transcripts';
import {
  cmdAutoConfirm,
  cmdClearKey,
  cmdMyModel,
  cmdProviders,
  cmdSetKey,
  cmdSetModel,
  handleAutoConfirmCallback,
  maybeHandleAutoConfirmNL,
} from './user-commands';
import { cmdAddChat, cmdAddUser, cmdReload, cmdTeam, cmdWhoami } from './roster-commands';
import { cmdNotify } from './notify-commands';
import { rosterView } from './roster';
import { startScheduler } from './scheduler';
import { resolveLLMForUser } from './users';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

const bot = new Bot(token);

// Telegram caps a message at 4096 chars. /list, /mine and the digests over a
// large task set blow past that - sendMessage 400s and the user sees nothing.
// This transformer splits any oversized text on line boundaries and sends the
// pieces in order, so every command stays reliable regardless of list size.
const TG_LIMIT = 4096;
function splitForTelegram(text: string): string[] {
  if (text.length <= TG_LIMIT) return [text];
  const chunks: string[] = [];
  let buf = '';
  for (const line of text.split('\n')) {
    if (line.length > TG_LIMIT) {
      if (buf) {
        chunks.push(buf);
        buf = '';
      }
      for (let i = 0; i < line.length; i += TG_LIMIT) {
        chunks.push(line.slice(i, i + TG_LIMIT));
      }
      continue;
    }
    if (buf.length + line.length + 1 > TG_LIMIT) {
      chunks.push(buf);
      buf = line;
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}
bot.api.config.use(async (prev, method, payload, signal) => {
  if (method === 'sendMessage' && 'text' in payload && typeof payload.text === 'string') {
    const parts = splitForTelegram(payload.text);
    if (parts.length > 1) {
      let result = await prev(method, { ...payload, text: parts[0] }, signal);
      for (let i = 1; i < parts.length; i++) {
        result = await prev(method, { ...payload, text: parts[i] }, signal);
      }
      return result;
    }
  }
  return prev(method, payload, signal);
});

await ensureCoworkHome();

// Roster is loaded from data/team.json in repo via Octokit + cached locally.
// ENV ALLOWLIST_USER_IDS / ALLOWLIST_CHAT_IDS are now FALLBACK ONLY (cold start
// without GITHUB_TOKEN). Adding a user = /adduser <tg_id> <Name> from admin DM,
// commits to repo, hot-reloads. NO restart needed.
const bootRoster = await rosterView();
if (bootRoster.allowedUserIds.size === 0) {
  console.error('roster empty - no users allowed. set ALLOWLIST_USER_IDS as fallback or push data/team.json');
  process.exit(1);
}
console.log(`[zaocoworking] roster loaded: ${bootRoster.memberCount} members, ${bootRoster.chatCount} chats`);

function chatScopeOf(ctx: Context): string {
  return ctx.chat?.type === 'private' ? 'private' : String(ctx.chat?.id ?? 'unknown');
}

async function isAllowedSender(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId) return false;
  const view = await rosterView();
  if (!view.allowedUserIds.has(userId)) return false;
  if (ctx.chat?.type === 'private') return true;
  // Group: chat must be allowlisted AND message must @mention the bot
  if (!ctx.chat?.id || !view.allowedChatIds.has(ctx.chat.id)) return false;
  const text = ctx.message?.text ?? '';
  const me = bot.botInfo?.username ?? '';
  return me ? text.includes(`@${me}`) : false;
}

function senderLabel(ctx: Context): string {
  return ctx.from?.first_name ?? ctx.from?.username ?? `user:${ctx.from?.id ?? '?'}`;
}

// LLM dispatch moved to ./llm — callLLM({provider, model, system, user, apiKey}).
// Per-user provider/model/key resolved via resolveLLMForUser() from ./users.

async function logIncoming(ctx: Context, text: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  await logMessage({
    chat_id: String(chatId),
    chat_type: ctx.chat?.type === 'private' ? 'dm' : 'group',
    chat_title: ctx.chat && 'title' in ctx.chat ? ctx.chat.title : undefined,
    from_user_id: ctx.from?.id ?? 0,
    from_user_name: senderLabel(ctx),
    direction: 'in',
    message_text: text,
    reply_to_id: ctx.message?.reply_to_message?.message_id,
  });
}

async function logOutgoing(ctx: Context, text: string, latencyMs: number, model: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  await logMessage({
    chat_id: String(chatId),
    chat_type: ctx.chat?.type === 'private' ? 'dm' : 'group',
    chat_title: ctx.chat && 'title' in ctx.chat ? ctx.chat.title : undefined,
    from_user_id: 0,
    from_user_name: 'ZAOcoworkingBot',
    direction: 'out',
    message_text: text,
    bot_model: model,
    response_latency_ms: latencyMs,
  });
}

async function withErrorReply(ctx: Context, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error('[zaocoworking] handler failed:', (err as Error).message);
    await ctx.reply(`error: ${(err as Error).message.slice(0, 200)}`).catch(() => {});
  }
}

bot.command('start', async (ctx) => {
  if (!(await isAllowedSender(ctx))) return;
  await withErrorReply(ctx, () => cmdStart(ctx));
});

function withArgs(handler: (ctx: Context, args: string) => Promise<void>): (ctx: Context) => Promise<void> {
  return async (ctx: Context) => {
    if (!(await isAllowedSender(ctx))) return;
    const text = ctx.message?.text ?? '';
    const args = text.replace(/^\/\w+(@\S+)?\s*/, '');
    await withErrorReply(ctx, () => handler(ctx, args));
  };
}

bot.command('mine', withArgs((ctx) => cmdMine(ctx)));
bot.command('list', withArgs(cmdList));
bot.command('add', withArgs(cmdAdd));
bot.command('wip', withArgs(cmdWip));
bot.command('blocked', withArgs(cmdBlocked));
bot.command('done', withArgs(cmdDone));
bot.command('assign', withArgs(cmdAssign));
bot.command('setdue', withArgs(cmdSetDue));
bot.command('setnote', withArgs(cmdSetNote));
bot.command('setprio', withArgs(cmdSetPrio));
bot.command('daily', withArgs((ctx) => cmdDaily(ctx)));

// v2.5 - model selection + BYOK
bot.command('setmodel', withArgs(cmdSetModel));
bot.command('mymodel', withArgs((ctx) => cmdMyModel(ctx)));
bot.command('setkey', withArgs(cmdSetKey));
bot.command('clearkey', withArgs(cmdClearKey));
bot.command('providers', withArgs((ctx) => cmdProviders(ctx)));
bot.command('autoconfirm', withArgs(cmdAutoConfirm));

// v2.6 - team roster (no-restart member management)
bot.command('team', withArgs((ctx) => cmdTeam(ctx)));
bot.command('adduser', withArgs(cmdAddUser));
bot.command('addchat', withArgs((ctx) => cmdAddChat(ctx)));
bot.command('reload', withArgs((ctx) => cmdReload(ctx)));

// v2.7 - self-onboarding. /whoami works for ANYONE (not gated by allowlist)
// so new people can DM the bot and learn how to join.
bot.command('whoami', (ctx) => withErrorReply(ctx, () => cmdWhoami(ctx)));

// v2.8 - proactive notification opt-out (per-user)
bot.command('notify', withArgs(cmdNotify));

bot.on('message:text', async (ctx) => {
  const text = ctx.message?.text ?? '';
  if (text.startsWith('/')) return; // already handled

  // v2.17 - confirmation fast-path. A pending suggestion is a question the bot
  // just asked; the user's "yes"/"no" answers it and MUST work even in a group
  // with no @mention. Without this the bot says "reply yes" then never sees the
  // reply (groups require an @mention) - the catch-22 Zaal hit. Safe:
  // maybeHandleConfirmation only matches a pending created for THIS exact
  // chat+user, and pendings are only ever created in an allowlisted chat.
  // Gated on a known roster user so unrelated chats cannot probe it.
  {
    const uid = ctx.from?.id;
    const view = await rosterView();
    if (uid && view.allowedUserIds.has(uid) && (await maybeHandleConfirmation(ctx, text))) {
      await logIncoming(ctx, text).catch(() => {});
      return;
    }
  }

  if (!(await isAllowedSender(ctx))) {
    const userId = ctx.from?.id;
    console.log(`[zaocoworking] drop from ${userId} (${ctx.from?.username ?? '?'}) chat=${ctx.chat?.id}`);
    // v2.7 self-onboarding: in DMs only, reply to non-allowlisted users
    // with their ID + how to ask an admin to add them. Groups stay silent
    // (would be noisy if random people typed in a shared chat).
    if (ctx.chat?.type === 'private' && userId) {
      const name = ctx.from?.first_name ?? ctx.from?.username ?? 'there';
      await ctx.reply(
        `hi ${name}, you're not on the cowork roster yet.\n\n` +
          `your telegram id is ${userId}.\n\n` +
          `ask Zaal or Iman to run:\n` +
          `/adduser ${userId} ${name}\n\n` +
          `they'll get you added in a few seconds (no restart needed).`,
      ).catch(() => {});
    }
    return;
  }
  await logIncoming(ctx, text);

  // v2.13 - intercept "autonomy on/off" + aliases BEFORE the LLM sees it.
  // Iman tried "Autonomy on" in plain English and got nothing useful.
  if (await maybeHandleAutoConfirmNL(ctx, text)) return;

  const scope = chatScopeOf(ctx);
  const blocks = await buildMemoryBlocks(scope);
  const systemPrompt = memoryBlocksToSystemPrompt(blocks, scope);
  const llm = await resolveLLMForUser(ctx.from?.id ?? 0);
  const started = Date.now();
  await ctx.replyWithChatAction('typing').catch(() => {});
  // v2.18 - explicit ack so the sender sees their message landed. The LLM path
  // can take several seconds; the typing indicator alone is easy to miss. The
  // ack bubble is deleted once the real reply is ready, so the chat stays clean.
  const ackMsg = await ctx.reply('message received, thinking...').catch(() => null);
  const clearAck = async (): Promise<void> => {
    if (ackMsg && ctx.chat?.id) {
      await ctx.api.deleteMessage(ctx.chat.id, ackMsg.message_id).catch(() => {});
    }
  };
  try {
    const raw = await callLLM({
      provider: llm.provider,
      model: llm.model,
      system: systemPrompt,
      user: `${senderLabel(ctx)}: ${text}`,
      apiKey: llm.apiKey,
    });
    const final = await maybeStartSuggestionFlow(ctx, raw);
    const latency = Date.now() - started;
    await clearAck();
    if (!final) {
      await ctx.reply('(empty reply - check logs)');
      return;
    }
    await ctx.reply(final);
    await logOutgoing(ctx, final, latency, `${llm.provider}/${llm.model}`);
  } catch (err) {
    await clearAck();
    console.error('[zaocoworking] llm failed:', (err as Error).message);
    await ctx.reply(`error: ${(err as Error).message.slice(0, 200)}`);
  }
});

// v2.7 - auto-register the slash command menu in Telegram on every boot. Adding
// a new command in commands.ts now shows up in the menu automatically; no more
// manual /setcommands in BotFather. Source-of-truth = code.
const TG_COMMANDS = [
  { command: 'start', description: 'help / list every command' },
  { command: 'mine', description: 'my open items' },
  { command: 'list', description: 'all open items by owner' },
  { command: 'add', description: 'create new item assigned to me' },
  { command: 'wip', description: 'move item to in-progress' },
  { command: 'blocked', description: 'mark item BLOCKED with reason' },
  { command: 'done', description: 'mark item DONE' },
  { command: 'assign', description: 'reassign owner' },
  { command: 'setdue', description: 'set due date (YYYY-MM-DD or "clear")' },
  { command: 'setnote', description: 'set or append notes on an item' },
  { command: 'setprio', description: 'set priority (P1|P2|P3)' },
  { command: 'daily', description: 'admin: post digest of open items' },
  { command: 'team', description: 'show current roster + chats' },
  { command: 'adduser', description: 'admin: add member, no restart' },
  { command: 'addchat', description: 'admin: allow CURRENT group chat' },
  { command: 'reload', description: 'admin: refresh roster from github' },
  { command: 'whoami', description: 'show my telegram id (for joining)' },
  { command: 'notify', description: 'manage my proactive DM channels' },
  { command: 'providers', description: 'list LLM providers' },
  { command: 'mymodel', description: 'my current provider + model' },
  { command: 'setmodel', description: 'choose provider and model' },
  { command: 'setkey', description: 'DM only: bring your own API key' },
  { command: 'clearkey', description: 'drop my BYOK for a provider' },
  { command: 'autoconfirm', description: 'on|off - skip "yes" step on NL edits' },
];

// v2.13 - inline-keyboard callbacks (for the bare /autoconfirm toggle UI).
// Callback queries don't carry the user's text message, so we can't run the
// full isAllowedSender @-mention check - just verify the user is on roster.
bot.on('callback_query:data', async (ctx) => {
  const userId = ctx.from?.id;
  const view = await rosterView();
  if (!userId || !view.allowedUserIds.has(userId)) {
    await ctx.answerCallbackQuery('not on roster').catch(() => {});
    return;
  }
  // Future callback handlers can chain; each returns true if it matched.
  if (await handleAutoConfirmCallback(ctx)) return;
  if (await handleListCallback(ctx)) return;
  await ctx.answerCallbackQuery().catch(() => {});
});

// v2.8 - start the cron scheduler (morning digest, EOD check, stale alert)
startScheduler(bot);

// doc 669 Phase 1 - ZABAL Bonfire integration. Log status at boot. Drain any
// events that failed during the last run (best-effort).
import { bonfireStatusLine, drainSpool, isBonfireEnabled } from './teams';
console.log(`[zaocoworking] ${bonfireStatusLine()}`);
if (isBonfireEnabled()) {
  drainSpool().catch((e) => console.error('[bonfire] boot drain failed:', e));
}

await bot.start({
  onStart: async (info) => {
    console.log(`[zaocoworking] online as @${info.username}`);
    try {
      await bot.api.setMyCommands(TG_COMMANDS);
      console.log(`[zaocoworking] registered ${TG_COMMANDS.length} slash commands with telegram`);
    } catch (err) {
      console.error('[zaocoworking] setMyCommands failed:', (err as Error).message);
    }
  },
});
