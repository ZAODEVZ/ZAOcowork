"use client";

import { useEffect, useMemo, useState } from "react";
import { QuickAddBody } from "./QuickAddBody";
import type { ActionItem } from "@/lib/types";

// QuickAdd is the universal Cmd/Ctrl+K surface (doc 763 F7).
// Two modes inside the modal:
//   - "add" (default, what existed before): create a new task via NL parse
//   - "find" (typing in the top input with no leading "/"): fuzzy-search
//     the current items[] and open the chosen task in TaskRoom
//
// The inline add bar at the top of the board stays as the no-modal path.
// Cmd+K opens the modal, Esc closes.
//
// Search is intentionally simple: lowercased substring match on title +
// notes + id, scored so title matches rank above notes. Sorting by score
// then by relativeTime so freshest tasks win ties. Top 8 shown. Click or
// Enter on the highlighted row opens TaskRoom via onOpenTask().

type Mode = "add" | "find";

export function QuickAdd({
  currentUser,
  defaultCategory,
  tabBrand,
  items,
  onOpenTask,
}: {
  currentUser: string;
  defaultCategory: string;
  tabBrand: string | null;
  // Doc 763 F7: passed by Board so the find mode can search across the
  // visible items without re-fetching. Optional so existing call sites
  // that don't have items yet still compile (find mode renders empty).
  items?: ActionItem[];
  onOpenTask?: (id: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        const tag = (document.activeElement?.tagName ?? "").toLowerCase();
        const editable = (document.activeElement as HTMLElement | null)?.isContentEditable;
        if (tag === "input" || tag === "textarea" || editable) return;
        e.preventDefault();
        setModalOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && modalOpen) {
        setModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) {
      setMode("add");
      setSearchQuery("");
      setHighlighted(0);
    }
  }, [modalOpen]);

  const searchResults = useMemo(() => {
    if (mode !== "find" || !items || !searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    const scored = items
      .filter((it) => !it.archivedAt && it.status !== "TRIAGE")
      .map((it) => {
        const title = (it.title ?? "").toLowerCase();
        const notes = (it.notes ?? "").toLowerCase();
        const id = String(it.id ?? "");
        let score = 0;
        if (id === q || id.startsWith(q)) score += 100;
        if (title === q) score += 50;
        if (title.startsWith(q)) score += 30;
        if (title.includes(q)) score += 15;
        if (notes.includes(q)) score += 5;
        return { it, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.it.updatedAt).getTime() - new Date(a.it.updatedAt).getTime();
      })
      .slice(0, 8);
    return scored;
  }, [items, mode, searchQuery]);

  function openTask(id: string) {
    setModalOpen(false);
    if (onOpenTask) onOpenTask(id);
  }

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, Math.max(0, searchResults.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = searchResults[highlighted];
      if (r) openTask(r.it.id);
    }
  }

  return (
    <>
      <div className="relative">
        <QuickAddBody
          currentUser={currentUser}
          defaultCategory={defaultCategory}
          tabBrand={tabBrand}
        />
        <div className="hidden md:block absolute top-3 right-32 text-[10px] text-white/30 pointer-events-none">
          <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5">⌘K</kbd>{" "}
          for focused add or find
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
          onClick={() => setModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl rounded-2xl bg-[#0a1226] border border-white/15 shadow-2xl shadow-black/50 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] border border-white/10 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("add")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                    mode === "add"
                      ? "bg-zao-accent text-white"
                      : "text-white/55 hover:text-white/85"
                  }`}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setMode("find")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                    mode === "find"
                      ? "bg-zao-accent text-white"
                      : "text-white/55 hover:text-white/85"
                  }`}
                >
                  Find
                </button>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-xs text-white/50 hover:text-white/85 rounded border border-white/10 px-2 py-1"
              >
                Esc
              </button>
            </div>

            {mode === "add" ? (
              <>
                <div className="mb-2 text-[10px] text-white/40">
                  {tabBrand ? `auto-tag: ${tabBrand}` : "no brand auto-tag"}
                </div>
                <QuickAddBody
                  currentUser={currentUser}
                  defaultCategory={defaultCategory}
                  tabBrand={tabBrand}
                  autoFocus
                  compact
                  onSubmitted={() => setModalOpen(false)}
                />
              </>
            ) : (
              <div>
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlighted(0);
                  }}
                  onKeyDown={handleSearchKey}
                  placeholder="Search tasks by title, notes, or id..."
                  className="w-full rounded-lg bg-[#0b1220] border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-zao-accent/60"
                />
                {searchResults.length > 0 ? (
                  <ul className="mt-3 space-y-1 max-h-[40vh] overflow-y-auto">
                    {searchResults.map((r, i) => (
                      <li key={r.it.id}>
                        <button
                          type="button"
                          onClick={() => openTask(r.it.id)}
                          onMouseEnter={() => setHighlighted(i)}
                          className={`w-full text-left rounded-lg px-3 py-2 transition ${
                            i === highlighted
                              ? "bg-zao-accent/15 border border-zao-accent/40"
                              : "border border-transparent hover:bg-white/5"
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm text-white/90 truncate">{r.it.title}</span>
                            <span className="text-[10px] text-white/40 flex-shrink-0">
                              #{r.it.id} - {r.it.status}
                            </span>
                          </div>
                          {r.it.notes ? (
                            <div className="text-[11px] text-white/45 truncate mt-0.5">
                              {r.it.notes.slice(0, 100)}
                            </div>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3 text-xs text-white/40 px-1">
                    {searchQuery.trim()
                      ? "No matches. Try a shorter query."
                      : "Type to search across all active tasks. ↑↓ to navigate, Enter to open."}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
