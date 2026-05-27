"use client";

import { useEffect, useRef, useState } from "react";

// SLA grid chip (doc 763 / 764 F3). Sits in the corner of admin + chat
// pages. Click opens a small popover listing per-channel response-time
// expectations so the team can see "how long until I should chase"
// without DMing anyone.

const SLA_ROWS: Array<{ surface: string; expected: string; note: string }> = [
  { surface: "Telegram bot DM", expected: "30 min", note: "Business hours, command-style" },
  { surface: "Comment on task", expected: "1 business day", note: "Default written channel" },
  { surface: "Pending review (worker -> lead)", expected: "4 hours", note: "Worker is blocked" },
  { surface: "Triage routing", expected: "4 hours", note: "New items can't start" },
  { surface: "PR review (cowork#N)", expected: "1 business day", note: "Cycle-time bottleneck" },
  { surface: "Email", expected: "2 business days", note: "External-facing" },
  { surface: "@here in bot group", expected: "minutes", note: "Incident only" },
  { surface: "Chat Assistant question", expected: "instant", note: "LLM, read-only" },
];

export function SlaGridChip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="fixed bottom-4 right-4 z-30" ref={ref}>
      {open && (
        <div className="mb-2 w-[min(420px,calc(100vw-2rem))] rounded-2xl bg-[#0a1226] border border-white/15 shadow-2xl shadow-black/40 p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-white/90">Response-time grid</div>
              <div className="text-[10px] text-white/45 mt-0.5">
                Async only works when expectations are explicit
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] text-white/45 hover:text-white/80 border border-white/10 rounded px-1.5 py-0.5"
            >
              Esc
            </button>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-white/45 uppercase tracking-wider text-[9px]">
                <th className="pb-1.5">Channel</th>
                <th className="pb-1.5">Reply within</th>
              </tr>
            </thead>
            <tbody>
              {SLA_ROWS.map((r) => (
                <tr key={r.surface} className="border-t border-white/[0.06]">
                  <td className="py-1.5 pr-2">
                    <div className="text-white/85">{r.surface}</div>
                    <div className="text-[10px] text-white/40">{r.note}</div>
                  </td>
                  <td className="py-1.5 text-white/80 whitespace-nowrap">{r.expected}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-[10px] text-white/35">
            Snoozing Telegram for 2 hours is fine; nothing in this grid breaks.
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-[#0a1226] border border-white/15 hover:border-white/30 shadow-lg shadow-black/30 text-white/70 hover:text-white text-[11px] px-3 py-1.5 transition"
        title="Show response-time SLAs"
      >
        SLA
      </button>
    </div>
  );
}
