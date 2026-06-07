"use client";

import { useEffect, useState } from "react";

// Autosave a text field to localStorage so a page crash, reload, or background
// refresh never loses what someone typed (Jose's "all my feedback got erased").
// Writes only on user edits (not on mount), restores any saved draft on mount,
// and clears on successful submit. Think of it as a recoverable scratch buffer
// for the textarea — the "MKV for text" ask.
export function useDraft(key: string, initial = "") {
  const [value, setValue] = useState(initial);

  // Restore a saved draft on mount / when the key changes (e.g. switching tasks).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(key);
    setValue(saved != null && saved !== "" ? saved : initial);
    // initial intentionally not in deps — only re-run when the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Update via this (not setValue) so persistence only happens on real edits.
  const update = (v: string) => {
    setValue(v);
    if (typeof window === "undefined") return;
    if (v) window.localStorage.setItem(key, v);
    else window.localStorage.removeItem(key);
  };

  // Reset to empty (append-style boxes: comment/update after sending).
  const clear = () => {
    setValue("");
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  };

  // Drop the saved draft but keep the current text (edit-style fields like notes
  // after a successful Save — the text is now the persisted value, not a draft).
  const commit = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  };

  return { value, update, clear, commit };
}
