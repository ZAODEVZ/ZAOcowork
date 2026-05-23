// telegram-notify.ts - server-side ping to @ZAOcoworkingBot when something
// changes that the owner cares about (assignment, status, etc).
//
// Best-effort: silently skips if TELEGRAM_BOT_TOKEN is missing, the owner
// has no tg_id mapped in team_members, or the Telegram API call fails.
// Notifications must never block or fail a tracker write - the cowork tracker
// is the source of truth, the ping is a courtesy.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
function db(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

async function tgIdForOwner(ownerLabel: string): Promise<number | null> {
  const lookup = ownerLabel?.trim();
  if (!lookup || lookup === "Open" || lookup === "Both") return null;
  const client = db();
  if (!client) return null;
  const { data, error } = await client
    .from("team_members")
    .select("telegram_id")
    .ilike("legacy_owner", lookup)
    .maybeSingle();
  if (error || !data) return null;
  return typeof data.telegram_id === "number" ? data.telegram_id : null;
}

async function sendTelegram(chatId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return; // no token configured - skip silently
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      // Short bound - never block the request long
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // swallow - best-effort
  }
}

// Public: ping when a task gets assigned to a new owner.
// title = task title, newOwner = canonical owner label ("Iman" etc),
// previousOwner = the old label (so we skip when unchanged), by = who made the change.
export async function pingOwnerAssigned(args: {
  title: string;
  newOwner: string;
  previousOwner?: string;
  by?: string;
  taskUrl?: string;
}): Promise<void> {
  const { title, newOwner, previousOwner, by, taskUrl } = args;
  if (!newOwner || newOwner === previousOwner) return;
  if (newOwner === "Open" || newOwner === "Both") return;
  const tgId = await tgIdForOwner(newOwner);
  if (!tgId) return;
  const lines = [
    `${by ? `${by} assigned` : "Assigned"} you a task:`,
    title,
  ];
  if (taskUrl) lines.push(taskUrl);
  await sendTelegram(tgId, lines.join("\n"));
}
