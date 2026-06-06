// Server-only. Sends a direct Telegram message to a single user via the Bot
// API — the same endpoint the agent bot uses, but called straight from the web
// app so a comment @mention can ping the mentioned person without a round-trip
// through the bot. telegram_id comes from data/team.json (the shared roster),
// imported at build time so it's bundled into the serverless function.

import teamFile from "../../data/team.json";

const API = "https://api.telegram.org";

interface TeamMemberLite {
  name: string;
  telegram_id: number | null;
  owner_value: string;
}

/**
 * Resolve a roster owner_value (e.g. "Zaal") to a telegram_id. Skips members
 * whose telegram_id is null, so duplicate owner_values (one with an id, one
 * without) resolve to the one that can actually receive a DM.
 */
export function telegramIdForOwnerValue(ownerValue: string): number | null {
  const k = ownerValue.trim().toLowerCase();
  for (const m of teamFile.members as TeamMemberLite[]) {
    if (m.telegram_id != null && m.owner_value.trim().toLowerCase() === k) {
      return m.telegram_id;
    }
  }
  return null;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Best-effort DM. Returns false (and logs) on any failure — never throws. */
export async function sendTelegramDM(tgId: number, html: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: tgId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      console.error(`[telegram-dm] to ${tgId} failed: ${data.description ?? res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[telegram-dm] to ${tgId} error:`, err);
    return false;
  }
}

/** Public base URL for deep links, if configured. May be "". */
export function appBaseUrl(): string {
  const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}
