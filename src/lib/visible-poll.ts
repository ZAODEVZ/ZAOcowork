// Poll only while the tab is visible.
//
// WHY: BotsBoard.tsx polled at 5s, 10s, 30s and 30s with no visibility check,
// so one backgrounded BotsBoard tab made 1,320 function calls an hour, or
// 950,400 a month, against the 1,000,000-call Vercel Hobby limit that this
// project shares with another. Hidden tabs now make no calls. A tab coming
// back to the foreground refetches once, so it never shows stale data.

export interface VisibilityDoc {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/**
 * Call `fn` now (if visible) and every `ms` while the document is visible;
 * call it once more whenever the document becomes visible again.
 * Returns a cleanup for useEffect.
 */
export function startVisiblePoll(
  fn: () => void,
  ms: number,
  doc: VisibilityDoc = document,
): () => void {
  const visible = (): boolean => doc.visibilityState === "visible";
  if (visible()) fn();
  const timer = setInterval(() => {
    if (visible()) fn();
  }, ms);
  const onChange = (): void => {
    if (visible()) fn();
  };
  doc.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(timer);
    doc.removeEventListener("visibilitychange", onChange);
  };
}
