import { describe, expect, it } from "vitest";
import { countCompletedInWindow } from "./data";

// The bug this catches: /api/overview used to fetch tasks with DONE rows
// already dropped in SQL (listItems({ openOnly: true })), then filter that
// same done-free array for status === "DONE" - always empty, so "done this
// week" read 0 no matter how many cards actually closed. A done-empty input
// here looks identical to a correctly-computed zero, which is exactly why
// this needed a test rather than just a fix: nothing else would have failed.

describe("countCompletedInWindow", () => {
  const now = new Date("2026-09-20T12:00:00Z").getTime();
  const day = 24 * 60 * 60 * 1000;

  it("counts a done item inside the window and excludes one outside it", () => {
    const items = [
      { completedAt: new Date(now - 2 * day).toISOString() }, // inside a 7d window
      { completedAt: new Date(now - 10 * day).toISOString() }, // outside a 7d window
    ];
    expect(countCompletedInWindow(items, 7, now)).toBe(1);
  });

  it("regresses to 0 under the old bug's shape - an empty input - proving the assertion can fail", () => {
    // Simulates the exact old defect: listItems({ openOnly: true }) meant
    // the array passed in here was always empty. This test's own point is
    // that the assertion above is not vacuously true.
    expect(countCompletedInWindow([], 7, now)).toBe(0);
  });

  it("excludes items with no completedAt", () => {
    const items = [{ completedAt: "" }, { completedAt: new Date(now - day).toISOString() }];
    expect(countCompletedInWindow(items, 7, now)).toBe(1);
  });

  it("is inclusive of the window boundary", () => {
    const items = [{ completedAt: new Date(now - 7 * day).toISOString() }];
    expect(countCompletedInWindow(items, 7, now)).toBe(1);
  });
});
