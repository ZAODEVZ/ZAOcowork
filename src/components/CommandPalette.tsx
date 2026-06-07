"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  id: string;
  title: string;
  status: string;
  owner: string;
  category: string;
}

const STATUS_DOT: Record<string, string> = {
  TRIAGE: "bg-fuchsia-400",
  TODO: "bg-slate-400",
  WIP: "bg-amber-400",
  BLOCKED: "bg-red-400",
  DONE: "bg-emerald-400",
};

// Global task search. Open with ⌘K / Ctrl-K, or "/" when not already typing.
// Renders nothing until opened. Used from NavBar so it's on every page.
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selRef = useRef<HTMLButtonElement | null>(null);

  // Keep the keyboard-selected result scrolled into view.
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setResults([]);
    setSel(0);
  }, []);

  // Global open shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (meta || (e.key === "/" && !typing && !open)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Also openable via a custom event (the nav search button dispatches it).
  useEffect(() => {
    const openEvt = () => setOpen(true);
    window.addEventListener("zao:open-search", openEvt);
    return () => window.removeEventListener("zao:open-search", openEvt);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) {
      setResults([]);
      setSel(0);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { results?: Hit[] } | null) => {
          setResults(d?.results ?? []);
          setSel(0);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const go = useCallback(
    (hit: Hit) => {
      close();
      router.push(`/todo/${encodeURIComponent(hit.id)}`);
    },
    [router, close],
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && results[sel]) {
      e.preventDefault();
      go(results[sel]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-xl rounded-2xl bg-[#0b1424] border border-white/15 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-white/10">
          <span className="text-white/30 text-sm">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search tasks by title, #id, owner, category…"
            className="flex-1 bg-transparent py-3.5 text-sm text-white placeholder-white/30 focus:outline-none"
          />
          <kbd className="text-[10px] text-white/30 border border-white/15 rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {q.trim() && results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-white/35">No matching tasks.</li>
          )}
          {results.map((hit, i) => (
            <li key={hit.id}>
              <button
                ref={i === sel ? selRef : undefined}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(hit)}
                className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition ${
                  i === sel ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                }`}
              >
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${STATUS_DOT[hit.status] ?? "bg-white/30"}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white/90 truncate">{hit.title}</span>
                  <span className="block text-[11px] text-white/40 truncate">
                    #{hit.id} · {hit.owner} · {hit.category}
                  </span>
                </span>
                <span className="text-[10px] text-white/35 flex-shrink-0">{hit.status}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
