"use client";

import { useEffect, useState } from "react";
import { Card, SectionHeader } from "../overview/ui";

interface VaultStatus {
  date: string;
  headline: string;
  shipped: string[];
  next: string[];
  updatedAt: string;
}

type FetchState =
  | { kind: "loading" }
  | { kind: "not-configured" }
  | { kind: "error" }
  | { kind: "ready"; status: VaultStatus };

export function VaultStatusWidget() {
  const [state, setState] = useState<FetchState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vault-status")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setState({ kind: "error" });
        } else if (!json.configured) {
          setState({ kind: "not-configured" });
        } else {
          setState({ kind: "ready", status: json.status });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "not-configured") return null; // no VAULT_STATUS_GITHUB_TOKEN set yet - not an error, just off
  if (state.kind === "error") return null; // fail-closed upstream already; don't show a broken widget

  return (
    <Card className="p-6">
      <SectionHeader label="Today" accent="blue">
        {state.kind === "ready" && (
          <span suppressHydrationWarning>{state.status.date}</span>
        )}
      </SectionHeader>

      {state.kind === "loading" && (
        <div className="h-16 animate-pulse rounded-lg bg-slate-700/30" />
      )}

      {state.kind === "ready" && (
        <div className="space-y-4">
          <p className="text-white text-base leading-relaxed">{state.status.headline}</p>

          {state.status.shipped.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-green-300/80 mb-1.5">
                Shipped
              </div>
              <ul className="space-y-1">
                {state.status.shipped.map((line, i) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-green-400/60">-</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.status.next.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-300/80 mb-1.5">
                Next
              </div>
              <ul className="space-y-1">
                {state.status.next.map((line, i) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-amber-400/60">-</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
