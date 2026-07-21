"use client";

import { useEffect, useState } from "react";

// The ZAO HUD - phone-first command center. Shows the live fleet (Mac terminals
// + VPS loops via fleet_status) attention-sorted (needs you / working / idle) +
// the top board items. Polls /api/hud every 5s. This page is the thing the
// Telegram Mini App wraps.

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
interface HudData {
  ok: boolean;
  fleet: FleetRow[];
  board: BoardRow[];
  ts: string;
}

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

const STATE_DOT: Record<string, string> = {
  waiting: "#f5a623",
  working: "#3fb950",
  idle: "#3a4a5e",
};

export default function HudPage() {
  const [data, setData] = useState<HudData | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const r = await fetch("/api/hud");
        const d = (await r.json()) as HudData;
        if (alive && d.ok) {
          setData(d);
          setErr(false);
        }
      } catch {
        if (alive) setErr(true);
      }
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const fleet = data?.fleet ?? [];
  const waiting = fleet.filter((f) => f.state === "waiting");
  const working = fleet.filter((f) => f.state === "working");
  const idle = fleet.filter((f) => f.state === "idle");
  const board = data?.board ?? [];

  return (
    <main className="min-h-[100dvh] bg-[#0a1424] text-[#e8eef5] px-4 py-4 pb-24">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-sm font-bold tracking-[2px] text-[#f5f0d8]">ZAO HUD</h1>
        <span className="text-[11px] text-[#6b7c92] flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ background: err ? "#d9534f" : "#3fb950" }}
          />
          {data ? new Date(data.ts).toLocaleTimeString() : "..."}
        </span>
      </header>

      {/* NEEDS YOU */}
      <section className="rounded-2xl border border-[#f5a623]/30 bg-[#12100a]/40 p-3 mb-4">
        <h2 className="text-[11px] uppercase tracking-wider text-[#f5a623] mb-2">
          Needs you {waiting.length ? `· ${waiting.length}` : ""}
        </h2>
        {waiting.length ? (
          <div className="space-y-2">
            {waiting.map((f) => (
              <div key={f.session} className="rounded-xl border border-[#f5a623]/40 bg-[#0e1b2d] p-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATE_DOT.waiting }} />
                  <span className="font-semibold text-[15px]">{f.session}</span>
                </div>
                <div className="text-[11px] text-[#6b7c92] mt-1">waiting {ago(f.updated_at)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[13px] text-[#4a5a70] py-1">Nothing needs you right now.</div>
        )}
      </section>

      {/* WORKING */}
      <Section title="Working" count={working.length}>
        {working.map((f) => (
          <Row key={f.session} name={f.session} dot={STATE_DOT.working} sub={`working · ${ago(f.updated_at)}`} />
        ))}
      </Section>

      {/* BOARD */}
      <Section title="Board" count={board.length}>
        {board.map((b) => (
          <Row key={b.id} name={b.title} dot="#f5a623" sub={b.legacy_id || ""} small />
        ))}
      </Section>

      {/* IDLE */}
      <Section title="Idle" count={idle.length}>
        {idle.map((f) => (
          <Row key={f.session} name={f.session} dot={STATE_DOT.idle} sub={ago(f.updated_at)} />
        ))}
      </Section>

      <p className="text-[11px] text-[#4a5a70] mt-6">
        Fleet = your Mac terminals + VPS loops · updates every 5s · push from Mac with zao-fleet-push
      </p>
    </main>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const empty = Array.isArray(items) && items.length === 0;
  return (
    <section className="mb-4">
      <h2 className="text-[11px] uppercase tracking-wider text-[#607089] mb-2">
        {title} {count ? `· ${count}` : ""}
      </h2>
      {empty ? <div className="text-[12px] text-[#4a5a70]">none</div> : <div className="space-y-2">{items}</div>}
    </section>
  );
}

function Row({ name, dot, sub, small }: { name: string; dot: string; sub: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-[#17273c] bg-[#0e1b2d] p-3">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dot }} />
        <span className={small ? "text-[13px]" : "font-semibold text-[15px]"}>{name}</span>
      </div>
      {sub ? <div className="text-[11px] text-[#4a5a70] mt-1 font-mono">{sub}</div> : null}
    </div>
  );
}
