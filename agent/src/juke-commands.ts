// /juke - create a ZAO Live audio space on Juke.
//
// Thin caller: it does not talk to Juke directly. It POSTs the ZAOOS Path B
// route (`/api/juke/space`), which holds the Juke credentials server-side and
// returns a `/live/{id}` link. The bot only needs the shared create-password.
// See ZAOOS research docs 695 + 710.

import { Context } from 'grammy';

/** ZAOOS base URL. Override with ZAOOS_API_BASE; trailing slashes trimmed. */
const ZAOOS_API_BASE = (process.env.ZAOOS_API_BASE || 'https://zaoos.com').replace(/\/+$/, '');

/** Abort the ZAOOS request if it has not responded within this many ms. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Shape of the ZAOOS /api/juke/space response (only the fields used here). */
interface JukeSpaceResponse {
  success?: boolean;
  error?: string;
  data?: { id?: string };
}

/**
 * `/juke <title>` - create a Juke live audio space and reply with its link.
 *
 * The link is sent in its own bare message bubble so it is clean to copy and
 * forward.
 */
export async function cmdJuke(ctx: Context, args: string): Promise<void> {
  const title = args.trim();
  if (!title) {
    await ctx.reply('usage: /juke <space title>\n\nexample: /juke ZAOstock Tuesday Standup');
    return;
  }
  if (title.length > 200) {
    await ctx.reply('title too long - keep it under 200 characters.');
    return;
  }

  const password = process.env.JUKE_CREATE_PASSWORD;
  if (!password) {
    await ctx.reply(
      'Juke space creation is not set up - JUKE_CREATE_PASSWORD is missing on the bot host.',
    );
    return;
  }

  await ctx.replyWithChatAction('typing').catch(() => {});

  let res: Response;
  try {
    res = await fetch(`${ZAOOS_API_BASE}/api/juke/space`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, password }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    await ctx.reply(
      timedOut
        ? 'ZAOOS timed out creating the space - try again in a moment.'
        : 'Could not reach ZAOOS to create the space.',
    );
    return;
  }

  let body: JukeSpaceResponse;
  try {
    body = (await res.json()) as JukeSpaceResponse;
  } catch {
    await ctx.reply(`ZAOOS returned an unreadable response (HTTP ${res.status}).`);
    return;
  }

  if (!res.ok || !body.success || !body.data?.id) {
    if (res.status === 401) {
      await ctx.reply(
        'Space creation was rejected - the bot password does not match ZAOOS. ' +
          'Check JUKE_CREATE_PASSWORD is the same on the bot host and on ZAOOS.',
      );
      return;
    }
    if (res.status === 503) {
      await ctx.reply(
        `Juke is not connected yet - ${body.error ?? 'the Juke developer key is not set on ZAOOS.'}`,
      );
      return;
    }
    await ctx.reply(`Could not create the space: ${body.error ?? `HTTP ${res.status}`}`);
    return;
  }

  const liveUrl = `${ZAOOS_API_BASE}/live/${body.data.id}`;
  await ctx.reply(
    `ZAO Live space created: ${title}\n\n` +
      'Listening is anonymous; speakers sign in with Farcaster inside the space.',
  );
  // The link goes in its own bare bubble - clean to copy and forward.
  await ctx.reply(liveUrl);
}
