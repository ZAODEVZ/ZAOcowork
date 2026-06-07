'use client';

/**
 * BotsBoard — drop-in fleet liveness panel for the coworking board.
 * Reads GET /api/v1/bots (see cowork docs/BOT-API.md) and auto-refreshes.
 *
 * AUTH: this client component fetches /api/v1/bots from the browser, so that
 * GET must be readable with the team's normal session cookie. If you'd rather
 * keep /api/v1/bots bearer-only, convert this to a server component that fetches
 * server-side with a service token and passes `bots` in as a prop.
 *
 * Adapt classNames to your design system; logic is framework-agnostic.
 */

import { useEffect, useState } from 'react';

interface BotHealth {
  bot: string;
  status: 'up' | 'degraded' | 'down';
  ts: number;
  meta?: Record<string, unknown>;
  online: boolean;
  ageSeconds: number;
}

function ago(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

export function BotsBoard() {
  const [bots, setBots] = useState<BotHealth[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/v1/bots', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { bots: BotHealth[] };
        if (alive) {
          setBots(data.bots ?? []);
          setError(null);
        }
      } catch (e: unknown) {
        if (alive) setError(e instanceof Error ? e.message : 'failed');
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Surface offline/stale bots first so a dead one is obvious.
  const sorted = [...bots].sort((a, b) => Number(a.online) - Number(b.online));

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-200">Bot fleet</h2>
      {error && <p className="text-xs text-red-400">status unavailable: {error}</p>}
      <ul className="space-y-2">
        {sorted.map((b) => {
          const dot = !b.online
            ? 'bg-red-500'
            : b.status === 'up'
              ? 'bg-green-500'
              : 'bg-amber-500';
          return (
            <li key={b.bot} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-200">
                <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                {b.bot}
              </span>
              <span className="text-xs text-slate-400">
                {b.online ? b.status : 'offline'} · {ago(b.ageSeconds)}
              </span>
            </li>
          );
        })}
        {sorted.length === 0 && !error && (
          <li className="text-xs text-slate-500">no heartbeats yet</li>
        )}
      </ul>
    </div>
  );
}
