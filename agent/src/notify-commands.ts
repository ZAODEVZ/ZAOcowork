// v2.8 - /notify slash command. Per-user opt-out for the proactive DMs.

import { Context } from 'grammy';
import {
  isNotifyEnabled,
  isValidNotifyChannel,
  NOTIFY_CHANNELS,
  setNotifyChannel,
  type NotifyChannel,
} from './users';

function tgId(ctx: Context): number | null {
  return ctx.from?.id ?? null;
}

export async function cmdNotify(ctx: Context, args: string): Promise<void> {
  const id = tgId(ctx);
  if (!id) return;
  const parts = args.trim().split(/\s+/);
  const [action, channel] = parts;

  // /notify (no args) -> show status
  if (!action || action === 'status') {
    const lines: string[] = ['your notification settings:'];
    for (const ch of NOTIFY_CHANNELS) {
      const on = await isNotifyEnabled(id, ch);
      lines.push(`  ${ch}: ${on ? 'ON' : 'OFF'}`);
    }
    lines.push('');
    lines.push('  /notify off <channel>   - disable');
    lines.push('  /notify on <channel>    - enable');
    lines.push('  /notify off all         - mute everything');
    lines.push('  /notify on all          - turn it all back on');
    await ctx.reply(lines.join('\n'));
    return;
  }

  if (action !== 'on' && action !== 'off') {
    await ctx.reply(`usage: /notify [status | on <channel> | off <channel> | on all | off all]\nchannels: ${NOTIFY_CHANNELS.join(', ')}`);
    return;
  }

  const enabled = action === 'on';
  if (channel === 'all') {
    for (const ch of NOTIFY_CHANNELS) {
      await setNotifyChannel(id, ch as NotifyChannel, enabled);
    }
    await ctx.reply(`all channels turned ${enabled ? 'on' : 'off'}`);
    return;
  }

  if (!channel || !isValidNotifyChannel(channel)) {
    await ctx.reply(`unknown channel "${channel ?? ''}". valid: ${NOTIFY_CHANNELS.join(', ')}`);
    return;
  }
  await setNotifyChannel(id, channel, enabled);
  await ctx.reply(`${channel} ${enabled ? 'ON' : 'OFF'}`);
}
