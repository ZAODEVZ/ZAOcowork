'use client';

/**
 * BotsBoard - fleet liveness + control plane panel for the coworking board.
 *
 * Observe (any session): each bot's current task, last error, and activity feed.
 * Control/Task/Converse (admins only): start/stop/restart/pause buttons, an
 * "assign task" form, and an "ask" box. These enqueue commands via
 * POST /api/v1/bots/commands; bots / the fleet-agent pull + execute + post back.
 *
 * The control affordances render only when `isAdmin` is true (the page passes it
 * from the server session). The server still enforces isAdmin on the enqueue
 * route - the prop only governs what is shown.
 */

import { useCallback, useEffect, useState } from 'react';

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

interface BotCommand {
  id: number;
  bot: string;
  command: string;
  args: Record<string, unknown> | null;
  status: string;
  result: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
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

function resultText(result: Record<string, unknown> | null): string | null {
  if (!result) return null;
  const reply = result.reply ?? result.message ?? result.summary ?? result.error;
  return typeof reply === 'string' && reply.trim() ? reply : null;
}

function ControlPanel({ bot, onChange }: { bot: string; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [todoId, setTodoId] = useState('');
  const [instructions, setInstructions] = useState('');

  const enqueue = useCallback(
    async (command: string, args?: Record<string, unknown>): Promise<void> => {
      setBusy(command);
      setNote(null);
      try {
        const res = await fetch('/api/v1/bots/commands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bot, command, args }),
        });
        const data = (await res.json()) as { ok?: boolean; id?: number; error?: string };
        setNote(res.ok ? `queued ${command}${data.id ? ` (#${data.id})` : ''}` : `failed: ${data.error ?? res.status}`);
        if (res.ok) onChange();
      } catch (e: unknown) {
        setNote(`failed: ${e instanceof Error ? e.message : 'error'}`);
      } finally {
        setBusy(null);
      }
    },
    [bot, onChange],
  );

  const lifecycle: Array<{ cmd: string; label: string; confirm?: boolean; host?: boolean }> = [
    { cmd: 'restart', label: 'Restart', confirm: true },
    { cmd: 'pause', label: 'Pause' },
    { cmd: 'resume', label: 'Resume' },
    { cmd: 'start', label: 'Start', host: true },
    { cmd: 'stop', label: 'Stop', confirm: true, host: true },
  ];

  return (
    <div className="mt-2 space-y-3 rounded-md border border-slate-800 bg-slate-950/40 p-3">
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Control (admin)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {lifecycle.map((b) => (
            <button
              key={b.cmd}
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (b.confirm && !window.confirm(`${b.label} ${bot}?`)) return;
                void enqueue(b.cmd);
              }}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              title={b.host ? 'requires the fleet-agent' : 'self-executed by the running bot'}
            >
              {busy === b.cmd ? '...' : b.label}
              {b.host ? ' *' : ''}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-slate-600">* start/stop need the zao-fleet-agent running on the bots box.</p>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Assign task
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={todoId}
            onChange={(e) => setTodoId(e.target.value)}
            placeholder="todo id"
            className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <input
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="instructions"
            className="min-w-[10rem] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <button
            type="button"
            disabled={busy !== null || (!todoId.trim() && !instructions.trim())}
            onClick={() => {
              void enqueue('run_task', {
                todo_id: todoId.trim() || undefined,
                instructions: instructions.trim() || undefined,
              });
              setTodoId('');
              setInstructions('');
            }}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            Assign
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Ask
        </p>
        <div className="flex items-center gap-1.5">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="ask this bot a question"
            className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          />
          <button
            type="button"
            disabled={busy !== null || !prompt.trim()}
            onClick={() => {
              void enqueue('ask', { prompt: prompt.trim() });
              setPrompt('');
            }}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {note ? <p className="text-[11px] text-slate-400">{note}</p> : null}
    </div>
  );
}

function CommandHistory({ bot, refreshKey }: { bot: string; refreshKey: number }) {
  const [commands, setCommands] = useState<BotCommand[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/v1/bots/${encodeURIComponent(bot)}/commands`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { commands: BotCommand[] };
        if (alive) setCommands(data.commands ?? []);
      } catch {
        /* best-effort */
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [bot, refreshKey]);

  if (commands.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/40 p-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Commands
      </p>
      <ul className="space-y-1.5">
        {commands.map((c) => {
          const reply = resultText(c.result);
          const dot =
            c.status === 'done'
              ? 'text-green-400'
              : c.status === 'error'
                ? 'text-red-400'
                : 'text-amber-400';
          return (
            <li key={c.id} className="text-xs">
              <span className="text-slate-500">{tsAgo(c.created_at)}</span>{' '}
              <span className="font-mono text-slate-300">{c.command}</span>{' '}
              <span className={dot}>{c.status}</span>
              <span className="text-slate-600"> by {c.created_by}</span>
              {reply ? <p className="mt-0.5 pl-2 text-slate-400">{reply}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BotDetail({ bot, isAdmin }: { bot: string; isAdmin: boolean }) {
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

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
    <>
      {isAdmin ? <ControlPanel bot={bot} onChange={bumpRefresh} /> : null}
      {isAdmin ? <CommandHistory bot={bot} refreshKey={refreshKey} /> : null}
      <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/60 p-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Recent activity
        </p>
        {error ? <p className="text-xs text-red-400">events unavailable: {error}</p> : null}
        {events.length === 0 && !error ? (
          <p className="text-xs text-slate-500">no events yet</p>
        ) : null}
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
    </>
  );
}

export function BotsBoard({ isAdmin = false }: { isAdmin?: boolean }) {
  const [bots, setBots] = useState<BotHealth[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Expanded rows are independent - multiple bots can be open at once.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = useCallback((bot: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(bot)) next.delete(bot);
      else next.add(bot);
      return next;
    });
  }, []);

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

  const sorted = [...bots].sort((a, b) => Number(a.online) - Number(b.online));

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-200">Bot fleet</h2>
      {error ? <p className="text-xs text-red-400">status unavailable: {error}</p> : null}
      <ul className="space-y-2">
        {sorted.map((b) => {
          const dot = !b.online
            ? 'bg-red-500'
            : b.status === 'up'
              ? 'bg-green-500'
              : 'bg-amber-500';
          const current = metaString(b.meta, 'current_task');
          const lastError = metaString(b.meta, 'last_error');
          const isOpen = open.has(b.bot);
          return (
            <li key={b.bot}>
              <button
                type="button"
                onClick={() => toggleOpen(b.bot)}
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
              {isOpen ? (
                <div className="pl-4">
                  {current || lastError ? (
                    <div className="mt-1 space-y-0.5 text-xs">
                      {current ? <p className="text-slate-300">task: {current}</p> : null}
                      {lastError ? <p className="text-red-400">last error: {lastError}</p> : null}
                    </div>
                  ) : null}
                  <BotDetail bot={b.bot} isAdmin={isAdmin} />
                </div>
              ) : null}
            </li>
          );
        })}
        {sorted.length === 0 && !error ? (
          <li className="text-xs text-slate-500">no heartbeats yet</li>
        ) : null}
      </ul>
    </div>
  );
}
