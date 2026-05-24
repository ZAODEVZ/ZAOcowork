/**
 * telegram-research-command.mjs
 *
 * Drop-in command handler for the ZAO Devz Bot. Wires `/research` to the
 * zaocowork dispatch pipeline. Framework-agnostic - works with both telegraf
 * and grammy (the handler returns the message and the caller binds it).
 *
 * Commands:
 *   /research              - show queue + usage
 *   /research next         - run first pending topic in queue
 *   /research <slug>       - run a specific topic
 *   /research queue        - show all topics with status
 *   /research status       - show currently running dispatches (if any)
 *
 * Wiring (telegraf example):
 *
 *   import { Telegraf } from 'telegraf';
 *   import { handleResearchCommand } from '/home/zao/repos/zaocowork/bot/telegram-research-command.mjs';
 *
 *   const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
 *   bot.command('research', (ctx) => handleResearchCommand({
 *     args: ctx.message.text.split(/\s+/).slice(1),
 *     reply: (text) => ctx.reply(text, { parse_mode: 'Markdown' }),
 *     allowedChatIds: [process.env.ZAO_DEVZ_CHAT_ID],
 *     chatId: ctx.chat.id,
 *   }));
 *
 * Wiring (grammy example):
 *
 *   import { Bot } from 'grammy';
 *   import { handleResearchCommand } from '/home/zao/repos/zaocowork/bot/telegram-research-command.mjs';
 *
 *   const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
 *   bot.command('research', async (ctx) => {
 *     await handleResearchCommand({
 *       args: ctx.match.split(/\s+/).filter(Boolean),
 *       reply: (text) => ctx.reply(text, { parse_mode: 'Markdown' }),
 *       allowedChatIds: [process.env.ZAO_DEVZ_CHAT_ID],
 *       chatId: ctx.chat.id,
 *     });
 *   });
 *
 * Auth: the command is gated by allowedChatIds. The dispatch subprocess
 * inherits process env (Claude Code CLI auth, BONFIRE_API_KEY, GH_TOKEN).
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Default points at the research-dispatch subdir inside the ZAOcowork repo.
const REPO_ROOT = process.env.RESEARCH_DISPATCH_DIR
  || process.env.ZAOCOWORK_REPO_PATH // legacy alias
  || '/home/zao/repos/ZAOcowork/research-dispatch';
const RUN_SCRIPT = path.join(REPO_ROOT, 'scripts', 'run-dispatch.mjs');
const QUEUE_PATH = path.join(REPO_ROOT, 'data', 'research-queue.json');

// In-process registry of currently-running dispatches (best-effort, not persisted).
const runningDispatches = new Map(); // slug -> { startedAt, pid }

function readQueue() {
  return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
}

function formatQueue() {
  const q = readQueue();
  const rows = q.topics.map(t => {
    const icon = t.status === 'done' ? '[DONE]'
      : t.status === 'in_progress' ? '[RUNNING]'
      : '[PENDING]';
    return `${icon} \`${t.slug}\` - ${t.name} (${t.dimensions.length} dims)`;
  });
  return `*Research queue* (${q.topics.length} topics)\n\n${rows.join('\n')}`;
}

function formatStatus() {
  if (runningDispatches.size === 0) return '_No dispatches currently running in this bot process._';
  const rows = [...runningDispatches.entries()].map(([slug, info]) => {
    const elapsedMin = Math.floor((Date.now() - info.startedAt) / 60000);
    return `\`${slug}\` - pid ${info.pid}, running ${elapsedMin} min`;
  });
  return `*Running dispatches*\n\n${rows.join('\n')}`;
}

function startDispatch({ slug, next, chatId, reply }) {
  const args = next ? ['--next'] : ['--slug', slug];

  // Tag the run with trigger context so commits show it.
  const env = {
    ...process.env,
    DISPATCH_TRIGGER: `telegram chat=${chatId}`,
    TELEGRAM_NOTIFY_CHAT_ID: String(chatId), // post progress back to the same chat
  };

  const child = spawn(process.execPath, [RUN_SCRIPT, ...args], {
    env,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  child.unref(); // let the bot survive without waiting

  const runSlug = slug || 'next';
  runningDispatches.set(runSlug, { startedAt: Date.now(), pid: child.pid });

  child.on('exit', () => runningDispatches.delete(runSlug));

  reply(`*Dispatch started*\nTarget: \`${runSlug}\`\npid: \`${child.pid}\`\n\nProgress will post here as subagents complete. Expect 10-15 min for a 5-dimension topic.`);
}

export async function handleResearchCommand({ args, reply, allowedChatIds, chatId }) {
  // Auth gate.
  if (allowedChatIds && allowedChatIds.length > 0) {
    if (!allowedChatIds.map(String).includes(String(chatId))) {
      return reply('_Not authorized for this chat._');
    }
  }

  const sub = (args[0] || '').toLowerCase();

  if (!sub || sub === 'help') {
    return reply(
      '*Research dispatch*\n\n' +
      '`/research queue` - list topics\n' +
      '`/research next` - run first pending topic\n' +
      '`/research <slug>` - run specific topic\n' +
      '`/research status` - show running dispatches'
    );
  }

  if (sub === 'queue') {
    return reply(formatQueue());
  }

  if (sub === 'status') {
    return reply(formatStatus());
  }

  if (sub === 'next') {
    return startDispatch({ slug: null, next: true, chatId, reply });
  }

  // Otherwise treat the first arg as a slug.
  const slug = args[0];
  const q = readQueue();
  const topic = q.topics.find(t => t.slug === slug);
  if (!topic) {
    return reply(`No topic with slug \`${slug}\`. Run \`/research queue\` to list.`);
  }
  if (topic.status === 'done' && !args.includes('--force')) {
    return reply(`\`${slug}\` already done. Re-run with \`/research ${slug} --force\`.`);
  }
  return startDispatch({ slug, next: false, chatId, reply });
}

export default handleResearchCommand;
