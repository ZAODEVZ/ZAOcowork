"use client";

import { useEffect, useRef, useState } from "react";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/chat-models";

const MODEL_KEY = "zao-chat-model-v1";
const SILENT_KEY = "zao-comment-silent-default"; // "1" = don't notify tagged by default

// Client-side preferences (per browser, no server round-trip). Kept here so the
// scattered toggles live in one place — the Assistant model, comment-notify
// default, and a button to try the command palette.
export function SettingsPanel() {
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [notifyTagged, setNotifyTagged] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.localStorage.getItem(MODEL_KEY);
    if (m && CHAT_MODELS.some((x) => x.id === m)) setModel(m);
    setNotifyTagged(window.localStorage.getItem(SILENT_KEY) !== "1");
  }, []);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);
  function flash(label: string) {
    setSaved(label);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSaved(null), 1500);
  }

  function changeModel(id: string) {
    setModel(id);
    window.localStorage.setItem(MODEL_KEY, id);
    flash("Saved");
  }

  function changeNotify(on: boolean) {
    setNotifyTagged(on);
    // store the inverse: "1" means silent-by-default
    if (on) window.localStorage.removeItem(SILENT_KEY);
    else window.localStorage.setItem(SILENT_KEY, "1");
    flash("Saved");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm text-white/85 font-medium">Assistant model</div>
          <div className="text-xs text-white/40">Which model the AI Assistant uses by default.</div>
        </div>
        <select
          value={model}
          onChange={(e) => changeModel(e.target.value)}
          className="rounded-lg bg-[#0b1220] border border-white/10 px-2.5 py-1.5 text-xs text-white/80 focus:outline-none focus:border-teal-400/60"
        >
          {CHAT_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-white/5" />

      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <div>
          <div className="text-sm text-white/85 font-medium">Notify tagged people by default</div>
          <div className="text-xs text-white/40">
            When on, @mentions in a comment ping people automatically (you can still
            toggle per comment).
          </div>
        </div>
        <input
          type="checkbox"
          checked={notifyTagged}
          onChange={(e) => changeNotify(e.target.checked)}
          className="h-4 w-4 accent-teal-500 flex-shrink-0"
        />
      </label>

      <div className="border-t border-white/5" />

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm text-white/85 font-medium">Quick search</div>
          <div className="text-xs text-white/40">
            Jump to any task from anywhere with <kbd className="px-1 border border-white/15 rounded">⌘K</kbd> or{" "}
            <kbd className="px-1 border border-white/15 rounded">/</kbd>.
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("zao:open-search"))}
          className="rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/[0.1] px-3 py-1.5 text-xs text-white/80 transition"
        >
          Try it
        </button>
      </div>

      {saved && <div className="text-[11px] text-teal-300">{saved}</div>}
    </div>
  );
}
