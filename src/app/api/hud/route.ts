import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The ZAO HUD data feed: live fleet sessions (fleet_status, written by the Mac
// pusher + the VPS loops), the standing bot harnesses (bot_heartbeats - ZOE,
// ZAO Devz, ZAOstock, cowork, farscout, ...), + the top open board items. The
// phone HUD polls this.

interface FleetRow {
  session: string;
  state: string;
  last_line: string | null;
  updated_at: string;
}
interface BoardRow {
  id: string;
  title: string;
  legacy_id: string | null;
}
interface HarnessRow {
  bot: string;
  status: string;
  updated_at: string;
}

const LIVE_WINDOW_MS = 45 * 60 * 1000;
// Bots heartbeat roughly every minute; anything silent past 10x that is down,
// not just between beats.
const HARNESS_STALE_MS = 10 * 60 * 1000;

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = db();
    const [fleetRes, boardRes, harnessRes] = await Promise.allSettled([
      supabase.from("fleet_status").select("session,state,last_line,updated_at").order("updated_at", { ascending: false }),
      supabase.from("tasks").select("id,title,legacy_id").eq("status", "todo").order("created_at", { ascending: false }).limit(15),
      supabase.from("bot_heartbeats").select("bot,status,updated_at").order("bot", { ascending: true }),
    ]);

    const now = Date.now();
    const fleet: FleetRow[] =
      fleetRes.status === "fulfilled" && fleetRes.value.data
        ? (fleetRes.value.data as FleetRow[]).filter(
            (r) => now - new Date(r.updated_at).getTime() < LIVE_WINDOW_MS,
          )
        : [];

    const board: BoardRow[] =
      boardRes.status === "fulfilled" && boardRes.value.data
        ? (boardRes.value.data as BoardRow[]).map((r) => ({
            id: r.id,
            title: (r.title || "").replace("Inbox action:", "").trim(),
            legacy_id: r.legacy_id,
          }))
        : [];

    // A row present but stale is reported down, not silently dropped - a bot
    // that stopped heartbeating an hour ago should read as down, not vanish.
    const harnesses: HarnessRow[] =
      harnessRes.status === "fulfilled" && harnessRes.value.data
        ? (harnessRes.value.data as HarnessRow[]).map((r) => ({
            bot: r.bot,
            status: now - new Date(r.updated_at).getTime() < HARNESS_STALE_MS ? r.status : "down",
            updated_at: r.updated_at,
          }))
        : [];

    return NextResponse.json({ ok: true, fleet, board, harnesses, ts: new Date().toISOString() });
  } catch (err) {
    console.error("hud data error", err);
    return NextResponse.json({ ok: false, error: "Failed to load fleet" }, { status: 500 });
  }
}
