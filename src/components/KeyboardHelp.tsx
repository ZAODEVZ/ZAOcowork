"use client";

import { useEffect, useState } from "react";

// Global keyboard-shortcuts cheat sheet. Opens on "?" (shift+/) when not
// typing in a field, closes on Esc or backdrop click. Mounted once from
// NavBar so it's available on every page. Documents the shortcuts that
// already exist elsewhere (CommandPalette, QuickAdd) — it doesn't bind them.

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["1"], label: "Board" },
  { keys: ["2"], label: "My Work" },
  { keys: ["3"], label: "Calendar" },
  { keys: ["4"], label: "Meetings" },
  { keys: ["5"], label: "Activity" },
  { keys: ["6"], label: "Chat" },
  { keys: ["7"], label: "CRM" },
  { keys: ["8"], label: "Admin / Settings" },
  { keys: ["⌘", "K"], label: "Quick add / find a task" },
  { keys: ["/"], label: "Search tasks" },
  { keys: ["↑", "↓"], label: "Move through results" },
  { keys: ["Enter"], label: "Open highlighted result" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["Esc"], label: "Close any overlay" },
];

export function KeyboardHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-sm rounded-2xl bg-[#07111e] border border-white/[0.12] shadow-2xl shadow-black/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white/85">Keyboard shortcuts</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[10px] text-white/40 hover:text-white/80 border border-white/15 rounded px-1.5 py-0.5"
          >
            esc
          </button>
        </div>
        <ul className="space-y-2.5">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4">
              <span className="text-sm text-white/70">{s.label}</span>
              <span className="flex items-center gap-1 flex-shrink-0">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="min-w-[1.5rem] text-center text-[11px] text-white/80 border border-white/15 bg-white/[0.05] rounded px-1.5 py-0.5"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
