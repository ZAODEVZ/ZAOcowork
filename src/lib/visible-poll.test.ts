import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startVisiblePoll, type VisibilityDoc } from "./visible-poll";

function fakeDoc(state: DocumentVisibilityState) {
  const listeners = new Set<() => void>();
  const doc: VisibilityDoc & { set(s: DocumentVisibilityState): void; count(): number } = {
    visibilityState: state,
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
    set(s) {
      this.visibilityState = s;
      for (const l of listeners) l();
    },
    count: () => listeners.size,
  };
  return doc;
}

describe("startVisiblePoll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls immediately and on every tick while visible", () => {
    const fn = vi.fn();
    const stop = startVisiblePoll(fn, 5_000, { doc: fakeDoc("visible") });
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    expect(fn).toHaveBeenCalledTimes(4);
    stop();
  });

  it("makes NO calls while the tab is hidden - the whole point", () => {
    const fn = vi.fn();
    const stop = startVisiblePoll(fn, 5_000, { doc: fakeDoc("hidden") });
    vi.advanceTimersByTime(60 * 60 * 1000); // an hour in the background
    expect(fn).toHaveBeenCalledTimes(0);
    stop();
  });

  it("refetches once when the tab comes back, then resumes polling", () => {
    const fn = vi.fn();
    const doc = fakeDoc("visible");
    const stop = startVisiblePoll(fn, 10_000, { doc: doc });
    doc.set("hidden");
    vi.advanceTimersByTime(60_000);
    expect(fn).toHaveBeenCalledTimes(1); // only the initial call
    doc.set("visible");
    expect(fn).toHaveBeenCalledTimes(2); // the catch-up refetch
    vi.advanceTimersByTime(10_000);
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
  });

  it("going hidden does not trigger a call", () => {
    const fn = vi.fn();
    const doc = fakeDoc("visible");
    const stop = startVisiblePoll(fn, 10_000, { doc: doc });
    doc.set("hidden");
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
  });

  it("leading: false makes no call until the first tick (Board.tsx's case)", () => {
    const fn = vi.fn();
    const stop = startVisiblePoll(fn, 120_000, { leading: false, doc: fakeDoc("visible") });
    expect(fn).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(119_999);
    expect(fn).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
  });

  it("cleanup stops the timer and removes the listener", () => {
    const fn = vi.fn();
    const doc = fakeDoc("visible");
    const stop = startVisiblePoll(fn, 5_000, { doc: doc });
    expect(doc.count()).toBe(1);
    stop();
    expect(doc.count()).toBe(0);
    vi.advanceTimersByTime(60_000);
    doc.set("visible");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
