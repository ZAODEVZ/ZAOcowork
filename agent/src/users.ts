// Per-user preferences + API keys at ~/.zaocoworking/users/<tg_id>.json.
// Used by /setmodel + /setkey commands and resolved per-message in the bot.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { COWORK_PATHS } from './paths';
import { PROVIDERS, type Provider } from './llm';

const USERS_DIR = join(COWORK_PATHS.home, 'users');

// Phase J adds four_hour_nudge - the proactive "do this now" DM that
// fires every 4h during ET waking hours (8a-10p) to Zaal/Iman/Shawn.
export type NotifyChannel = 'morning_digest' | 'eod_check' | 'stale_alert' | 'change_events' | 'four_hour_nudge';

export const NOTIFY_CHANNELS: readonly NotifyChannel[] = ['morning_digest', 'eod_check', 'stale_alert', 'change_events', 'four_hour_nudge'];

export interface UserPrefs {
  tg_id: number;
  preferred_provider?: Provider;
  preferred_model?: string;
  api_keys?: Partial<Record<Provider, string>>;
  // v2.8 - proactive notification opt-out (default: all channels ON).
  // Stored as { channel: false } for explicit disables. Missing = enabled.
  notify_disabled?: Partial<Record<NotifyChannel, boolean>>;
  // v2.11 - if true, natural-language mutations skip the suggest-then-confirm
  // step and write directly. Default: false (confirm flow). Admins typically
  // enable this for daily ops; cautious users leave it off.
  auto_confirm?: boolean;
  updated_at?: string;
}

function userPath(tgId: number): string {
  return join(USERS_DIR, `${tgId}.json`);
}

export async function loadUserPrefs(tgId: number): Promise<UserPrefs | null> {
  try {
    const raw = await fs.readFile(userPath(tgId), 'utf8');
    return JSON.parse(raw) as UserPrefs;
  } catch {
    return null;
  }
}

export async function saveUserPrefs(prefs: UserPrefs): Promise<void> {
  await fs.mkdir(USERS_DIR, { recursive: true });
  prefs.updated_at = new Date().toISOString();
  await fs.writeFile(userPath(prefs.tg_id), JSON.stringify(prefs, null, 2), 'utf8');
  // chmod 600 so other VPS users can't read API keys
  await fs.chmod(userPath(prefs.tg_id), 0o600);
}

export async function setUserModel(tgId: number, provider: Provider, model: string): Promise<void> {
  const existing = (await loadUserPrefs(tgId)) ?? { tg_id: tgId };
  existing.preferred_provider = provider;
  existing.preferred_model = model;
  await saveUserPrefs(existing);
}

export async function setUserApiKey(tgId: number, provider: Provider, key: string): Promise<void> {
  const existing = (await loadUserPrefs(tgId)) ?? { tg_id: tgId };
  existing.api_keys = { ...(existing.api_keys ?? {}), [provider]: key };
  await saveUserPrefs(existing);
}

export async function clearUserApiKey(tgId: number, provider: Provider): Promise<void> {
  const existing = await loadUserPrefs(tgId);
  if (!existing?.api_keys) return;
  delete existing.api_keys[provider];
  await saveUserPrefs(existing);
}

export interface ResolvedLLM {
  provider: Provider;
  model: string;
  apiKey?: string;
  source: 'user-prefs' | 'env-default';
}

import { DEFAULT_PROVIDER, DEFAULT_MODEL } from './llm';

export async function resolveLLMForUser(tgId: number): Promise<ResolvedLLM> {
  const prefs = await loadUserPrefs(tgId);
  const provider = prefs?.preferred_provider ?? DEFAULT_PROVIDER;
  const model = prefs?.preferred_model ?? DEFAULT_MODEL;
  const apiKey = prefs?.api_keys?.[provider];
  return {
    provider,
    model,
    apiKey,
    source: prefs?.preferred_provider ? 'user-prefs' : 'env-default',
  };
}

export function isValidProvider(s: string): s is Provider {
  return (PROVIDERS as readonly string[]).includes(s);
}

export function isValidNotifyChannel(s: string): s is NotifyChannel {
  return (NOTIFY_CHANNELS as readonly string[]).includes(s);
}

export async function setNotifyChannel(tgId: number, channel: NotifyChannel, enabled: boolean): Promise<void> {
  const existing = (await loadUserPrefs(tgId)) ?? { tg_id: tgId };
  existing.notify_disabled = { ...(existing.notify_disabled ?? {}) };
  if (enabled) {
    delete existing.notify_disabled[channel];
  } else {
    existing.notify_disabled[channel] = true;
  }
  await saveUserPrefs(existing);
}

export async function isNotifyEnabled(tgId: number, channel: NotifyChannel): Promise<boolean> {
  const prefs = await loadUserPrefs(tgId);
  if (!prefs?.notify_disabled) return true; // default ON
  return !prefs.notify_disabled[channel];
}

// v2.11 - autoconfirm helpers
export async function setAutoConfirm(tgId: number, enabled: boolean): Promise<void> {
  const existing = (await loadUserPrefs(tgId)) ?? { tg_id: tgId };
  existing.auto_confirm = enabled;
  await saveUserPrefs(existing);
}

export async function isAutoConfirm(tgId: number): Promise<boolean> {
  const prefs = await loadUserPrefs(tgId);
  return prefs?.auto_confirm === true;
}
