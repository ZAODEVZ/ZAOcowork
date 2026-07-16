"use client";

import { useState } from "react";
import { updateFactAction } from "@/app/admin/facts/actions";
import type { FactsMap } from "@/lib/facts-repo";

export function FactsPanel({ facts }: { facts: FactsMap }) {
  const entries = Object.entries(facts).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="space-y-3">
      {entries.map(([key, entry]) => (
        <FactCard key={key} factKey={key} entry={entry} />
      ))}
    </div>
  );
}

function FactCard({ factKey, entry }: { factKey: string; entry: FactsMap[string] }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold text-white/90">{factKey}</div>
          <div className="text-xs text-white/45 mt-1">{entry.description}</div>
          <div className="text-[11px] text-white/35 mt-1">Last verified: {entry.lastVerified}</div>
        </div>
        {!editing && (
          <button
            onClick={() => {
              setError(null);
              setSavedAt(null);
              setEditing(true);
            }}
            className="shrink-0 text-xs rounded-lg border border-white/10 px-2.5 py-1.5 hover:bg-white/5 text-white/70"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form
          action={async (fd) => {
            setPending(true);
            setError(null);
            try {
              await updateFactAction(fd);
              setEditing(false);
              setSavedAt(new Date().toLocaleTimeString());
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't save.");
            } finally {
              setPending(false);
            }
          }}
          className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center"
        >
          <input type="hidden" name="key" value={factKey} />
          <input
            name="value"
            defaultValue={entry.value}
            required
            className="flex-1 rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm font-mono text-white/90 focus:outline-none focus:border-blue-400/50"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-zao-accent hover:bg-blue-500 px-3 py-2 text-xs font-medium text-black disabled:opacity-50 transition"
            >
              {pending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setEditing(false);
              }}
              className="text-xs text-white/55 hover:text-white/85 px-2"
            >
              cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 font-mono text-sm text-white/85 break-all">{entry.value}</div>
      )}

      {error && (
        <div className="mt-2 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-200">
          {error}
        </div>
      )}
      {savedAt && !editing && (
        <div className="mt-2 text-[11px] text-emerald-300/80">
          Committed to main at {savedAt} - live on every paper within the usual deploy window.
        </div>
      )}
    </div>
  );
}
