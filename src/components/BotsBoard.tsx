'use client';

/**
 * BotsBoard - fleet liveness panel for the coworking board.
 * Reads GET /api/v1/bots (auto-refreshes 30s). Each row expands to a detail
 * panel showing the bot's current task + last error (from heartbeat meta) and
 * its recent activity feed (GET /api/v1/bots/:bot/events, also 30s refresh).
 *
 * AUTH: fetches from the browser, so both endpoints are session-readable for
 * logged-in team members (see the routes' dual bot-token/session auth).
 */

import { useEffect, useState } from 'react';

interface BotHealth {
  bot: string;
  status: 'up' | 'degraded' | 'down';
  ts: number | string;
  meta?: Record<string, unknown>;
  online: boolean;
  ageSeconds: number;
}

interface BotEvent {
  id: number;
  bot: string;
  kind: string;
  message: string | null;
  meta?: Record<string, unknown> | null;
  ts: string;
}

function ago(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

function tsAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return ago(secs);
}

function metaString(meta: Record<string, unknown> | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function BotDetail({ bot }: { bot: string }) {
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/v1/bots/${encodeURIComponent(bot)}/events`, {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { events: BotEvent[] };
        if (alive) {
          setEvents(data.events ?? []);
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
  }, [bot]);

  return (
    <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/60 p-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Recent activity
      </p>
      {error && <p className="text-xs text-red-400">events unavailable: {error}</p>}
      {events.length === 0 && !error && (
        <p className="text-xs text-slate-500">no events yet</p>
      )}
      <ul className="space-y-1.5">
        {events.map((e) => (
          <li key={e.id} className="text-xs">
            <span className="text-slate-500">{tsAgo(e.ts)}</span>{' '}
            <span className="font-mono text-slate-300">{e.kind}</span>
            {e.message ? <span className="text-slate-400"> - {e.message}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BotsBoard() {
  const [bots, setBots] = useState<BotHealth[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

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
          const current = metaString(b.meta, 'current_task');
          const lastError = metaString(b.meta, 'last_error');
          const isOpen = open === b.bot;
          return (
            <li key={b.bot}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : b.bot)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-sm hover:bg-slate-800/50"
              >
                <span className="flex items-center gap-2 text-slate-200">
                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                  {b.bot}
                  <span className="font-mono text-xs text-slate-600">{isOpen ? '[-]' : '[+]'}</span>
                </span>
                <span className="text-xs text-slate-400">
                  {b.online ? b.status : 'offline'} · {ago(b.ageSeconds)}
                </span>
              </button>
              {isOpen && (
                <div className="pl-4">
                  {current || lastError ? (
                    <div className="mt-1 space-y-0.5 text-xs">
                      {current ? <p className="text-slate-300">task: {current}</p> : null}
                      {lastError ? <p className="text-red-400">last error: {lastError}</p> : null}
                    </div>
                  ) : null}
                  <BotDetail bot={b.bot} />
                </div>
              )}
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
