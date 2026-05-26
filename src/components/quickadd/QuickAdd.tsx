"use client";

import { useEffect, useState } from "react";
import { QuickAddBody } from "./QuickAddBody";

// QuickAdd renders the inline add bar AND wires the Cmd/Ctrl+K global shortcut
// to open a focused modal version. Both surfaces use the same QuickAddBody so
// behavior stays in lockstep.
//
// Inline lives at the top of the board; modal floats centered with a backdrop
// + Esc to close. The "+ add item" boxes that used to sit on every column got
// removed - one place to add, less chrome, one source of truth.

export function QuickAdd({
  currentUser,
  defaultCategory,
  tabBrand,
}: {
  currentUser: string;
  defaultCategory: string;
  tabBrand: string | null;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        // Only intercept when the user isn't already typing somewhere.
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
          for focused add
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
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-zao-accent" />
                <h2 className="text-sm font-semibold text-white/90">Add task</h2>
                <span className="text-[10px] text-white/40">
                  {tabBrand ? `auto-tag: ${tabBrand}` : "no brand auto-tag"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-xs text-white/50 hover:text-white/85 rounded border border-white/10 px-2 py-1"
              >
                Esc
              </button>
            </div>
            <QuickAddBody
              currentUser={currentUser}
              defaultCategory={defaultCategory}
              tabBrand={tabBrand}
              autoFocus
              compact
              onSubmitted={() => setModalOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
