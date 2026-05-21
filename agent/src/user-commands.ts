// Slash commands for v2.5 - model selection + BYOK.
// /setmodel <provider> <model>     - set my preferred provider + model
// /setkey <provider> <key>         - DM-only; set my BYOK
// /clearkey <provider>             - remove my BYOK for a provider
// /mymodel                         - show my current resolved provider/model/source
// /providers                       - list available providers + how to set keys

import { Context, InlineKeyboard } from 'grammy';
import { PROVIDERS, DEFAULT_PROVIDER, DEFAULT_MODEL } from './llm';
import {
  clearUserApiKey,
  isAutoConfirm,
  isValidProvider,
  loadUserPrefs,
  resolveLLMForUser,
  setAutoConfirm,
  setUserApiKey,
  setUserModel,
} from './users';

function tgId(ctx: Context): number | null {
  return ctx.from?.id ?? null;
}

export async function cmdSetModel(ctx: Context, args: string): Promise<void> {
  const id = tgId(ctx);
  if (!id) return;
  const m = args.trim().match(/^(\S+)\s+(\S+)$/);
  if (!m) {
    await ctx.reply(
      `usage: /setmodel <provider> <model>\nproviders: ${PROVIDERS.join(', ')}\nexamples:\n  /setmodel claude-max sonnet\n  /setmodel claude-api claude-haiku-4-5-20251001\n  /setmodel openai gpt-4o-mini\n  /setmodel minimax abab6.5-chat`,
    );
    return;
  }
  const [, provider, model] = m;
  if (!isValidProvider(provider)) {
    await ctx.reply(`unknown provider "${provider}". valid: ${PROVIDERS.join(', ')}`);
    return;
  }
  await setUserModel(id, provider, model);
  await ctx.reply(`saved: ${provider} / ${model}`);
}

export async function cmdMyModel(ctx: Context): Promise<void> {
  const id = tgId(ctx);
  if (!id) return;
  const resolved = await resolveLLMForUser(id);
  const hasKey = !!resolved.apiKey;
  await ctx.reply(
    `provider: ${resolved.provider}\nmodel: ${resolved.model}\nsource: ${resolved.source}\napi key: ${hasKey ? 'set (per-user)' : 'env default'}`,
  );
}

export async function cmdSetKey(ctx: Context, args: string): Promise<void> {
  const id = tgId(ctx);
  if (!id) return;
  // DM only - never accept secrets in groups
  if (ctx.chat?.type !== 'private') {
    await ctx.reply('DM me /setkey - do not paste keys in a group chat. message will be ignored.');
    return;
  }
  const m = args.trim().match(/^(\S+)\s+(\S+)$/);
  if (!m) {
    await ctx.reply(
      `usage (DM only): /setkey <provider> <key>\nproviders: ${PROVIDERS.filter((p) => p !== 'claude-max').join(', ')}\nclaude-max uses local OAuth - no key needed.`,
    );
    return;
  }
  const [, provider, key] = m;
  if (!isValidProvider(provider)) {
    await ctx.reply(`unknown provider "${provider}". valid: ${PROVIDERS.join(', ')}`);
    return;
  }
  if (provider === 'claude-max') {
    await ctx.reply('claude-max uses local CLI OAuth - no per-user key needed. ignored.');
    return;
  }
  await setUserApiKey(id, provider, key);
  // Best-effort: delete the user's message containing the key so it doesn't sit in Telegram history
  try {
    if (ctx.message?.message_id) {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    }
  } catch {
    /* ignore - bot may lack delete perms */
  }
  await ctx.reply(`saved ${provider} key (your message was deleted from chat history)`);
}

export async function cmdClearKey(ctx: Context, args: string): Promise<void> {
  const id = tgId(ctx);
  if (!id) return;
  const provider = args.trim();
  if (!isValidProvider(provider)) {
    await ctx.reply(`usage: /clearkey <provider>. valid: ${PROVIDERS.join(', ')}`);
    return;
  }
  await clearUserApiKey(id, provider);
  await ctx.reply(`cleared ${provider} key. falls back to env default.`);
}

// v2.11 - autoconfirm. When ON, natural-language mutations write immediately
// instead of asking "reply yes to confirm". Slash commands always write
// directly regardless of this setting.
// v2.13 - bare /autoconfirm shows tap-to-toggle inline buttons (Iman feedback:
// "It's not giving me the option to say on or off, it just tells me what it
// does"). Also accept the alias "autonomy on/off" via the text handler.
export async function cmdAutoConfirm(ctx: Context, args: string): Promise<void> {
  const id = tgId(ctx);
  if (!id) return;
  const arg = args.trim().toLowerCase();
  const current = await isAutoConfirm(id);

  if (arg === 'on' || arg === 'off') {
    const target = arg === 'on';
    if (target === current) {
      await ctx.reply(`already ${arg.toUpperCase()}.`);
      return;
    }
    await setAutoConfirm(id, target);
    await ctx.reply(
      target
        ? 'autoconfirm ON. natural-language edits run immediately.'
        : 'autoconfirm OFF. natural-language edits will ask "yes" to confirm first.',
    );
    return;
  }
  if (arg !== '') {
    await ctx.reply('usage: /autoconfirm on | off (or tap the buttons after typing /autoconfirm with no args)');
    return;
  }
  // Bare /autoconfirm - show toggle buttons.
  const kb = new InlineKeyboard()
    .text(current ? '[ON - current]' : 'turn ON', 'ac:on')
    .text(current ? 'turn OFF' : '[OFF - current]', 'ac:off');
  await ctx.reply(
    `autoconfirm is ${current ? 'ON' : 'OFF'}.\n\nON: natural-language edits like "set #24 due to 2026-05-28" run immediately.\nOFF: bot suggests + asks "yes" first.\nSlash commands (/setdue, /done, etc) always run direct.\n\ntap a button or type /autoconfirm on | off`,
    { reply_markup: kb },
  );
}

// v2.13 - handle the inline-keyboard taps from the bare /autoconfirm screen.
export async function handleAutoConfirmCallback(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (data !== 'ac:on' && data !== 'ac:off') return false;
  const id = tgId(ctx);
  if (!id) {
    await ctx.answerCallbackQuery('no user id').catch(() => {});
    return true;
  }
  const target = data === 'ac:on';
  await setAutoConfirm(id, target);
  await ctx.answerCallbackQuery(target ? 'autoconfirm ON' : 'autoconfirm OFF').catch(() => {});
  await ctx
    .editMessageText(
      target
        ? 'autoconfirm ON. natural-language edits run immediately.\ntoggle anytime with /autoconfirm.'
        : 'autoconfirm OFF. natural-language edits ask "yes" to confirm first.\ntoggle anytime with /autoconfirm.',
    )
    .catch(() => {});
  return true;
}

// v2.13 - accept "autonomy on/off", "autoconfirm on/off", "auto on/off" as
// natural-language aliases. Returns true if the message matched + was handled,
// so the caller skips the LLM path.
const AUTOCONFIRM_NL_RE = /^\s*(?:autoconfirm|autonomy|auto-confirm|auto)\s+(on|off)\s*$/i;
export async function maybeHandleAutoConfirmNL(ctx: Context, text: string): Promise<boolean> {
  const m = text.match(AUTOCONFIRM_NL_RE);
  if (!m) return false;
  await cmdAutoConfirm(ctx, m[1].toLowerCase());
  return true;
}

export async function cmdProviders(ctx: Context): Promise<void> {
  const id = tgId(ctx);
  const prefs = id ? await loadUserPrefs(id) : null;
  const hasKey = (p: string) => !!prefs?.api_keys?.[p as never];
  const lines = PROVIDERS.map((p) => {
    const tag = p === 'claude-max' ? '(local OAuth, $0)' : hasKey(p) ? '(your key)' : '(env default if set)';
    return `  ${p} ${tag}`;
  });
  await ctx.reply(
    `providers:\n${lines.join('\n')}\n\ndefault: ${DEFAULT_PROVIDER} / ${DEFAULT_MODEL}\n\n/setmodel <provider> <model> - choose\n/setkey <provider> <key> - DM only, BYOK\n/clearkey <provider> - drop BYOK\n/mymodel - show current resolved settings`,
  );
}
