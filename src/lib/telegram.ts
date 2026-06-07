// Server-only Telegram sender for web-app-originated notifications (comment
// pings, etc). Uses the SAME bot token as the agent/ VPS bot (@ZAOcoworkingBot),
// but talks to the Bot API directly so the web app doesn't need the VPS in the
// loop for a simple group post.
//
// Dormant by design: if TELEGRAM_BOT_TOKEN or TELEGRAM_GROUP_CHAT_ID is unset
// the send is a logged no-op, so the feature stays off until configured on
// Vercel. Every call is best-effort and never throws — a Telegram outage must
// never break a comment save.

export interface TelegramSendResult {
  ok: boolean;
  messageId?: number;
  error?: string;
}

const API = "https://api.telegram.org";

/** Escape text for Telegram parse_mode=HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Post an HTML message to the configured group chat. Returns the message_id on
 * success so a future escalation sweep (VPS bot) can correlate reactions/replies.
 */
export async function sendGroupMessage(html: string): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!token || !chatId) {
    console.warn(
      "[telegram] skipped: set TELEGRAM_BOT_TOKEN + TELEGRAM_GROUP_CHAT_ID to enable comment notifications",
    );
    return { ok: false, error: "telegram not configured" };
  }
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };
    if (!data.ok) {
      console.error(`[telegram] send failed: ${data.description || res.status}`);
      return { ok: false, error: data.description || `HTTP ${res.status}` };
    }
    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    console.error("[telegram] send error", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * DM a single user by their numeric Telegram id. Best-effort — never throws.
 * Requires the user to have started the bot first (Telegram won't let a bot
 * open a conversation), otherwise the API returns 403 and we log + move on.
 */
export async function sendDirectMessage(
  tgId: number,
  html: string,
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "telegram not configured" };
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
    const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!data.ok) {
      console.error(`[telegram] DM to ${tgId} failed: ${data.description || res.status}`);
      return { ok: false, error: data.description || `HTTP ${res.status}` };
    }
    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    console.error(`[telegram] DM to ${tgId} error`, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
