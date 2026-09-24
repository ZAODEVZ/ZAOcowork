// Poll only while the tab is visible.
//
// WHY: BotsBoard.tsx polled at 5s, 10s, 30s and 30s with no visibility check.
// A backgrounded BotsBoard with one bot expanded made 1,320 function calls an
// hour (950,400 a month); with none expanded, 120 an hour. The Vercel Hobby
// limit is 1,000,000 calls a month, shared with another project. Hidden tabs
// now make no FETCHES - the interval keeps ticking (it costs nothing) but skips
// fn. A tab coming back to the foreground refetches once, so it is never stale.

export interface VisibilityDoc {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface VisiblePollOptions {
  /** Call fn immediately on start (if visible). Default true. Pass false where
   *  the effect re-runs on state changes and an immediate call would be an
   *  extra request each time - Board.tsx re-runs on every task-panel close. */
  leading?: boolean;
  /** Injected for tests; resolved at call time, so SSR never touches it as
   *  long as callers run inside useEffect. */
  doc?: VisibilityDoc;
}

/**
 * Call `fn` now (if visible and `leading`), then every `ms` while the document
 * is visible, and once more whenever the document becomes visible again.
 * Returns a cleanup for useEffect.
 */
export function startVisiblePoll(
  fn: () => void,
  ms: number,
  { leading = true, doc = document }: VisiblePollOptions = {},
): () => void {
  const visible = (): boolean => doc.visibilityState === "visible";
  if (leading && visible()) fn();
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
