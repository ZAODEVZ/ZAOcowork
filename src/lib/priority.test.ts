import { describe, expect, it } from "vitest";
import { PRIORITY_ORDER, byPriority, isHot, priorityRank, DEPRECATED_AXES } from "./priority";
import type { ActionItem } from "./types";

const task = (over: Partial<ActionItem> = {}): ActionItem =>
  ({
    id: "1",
    title: "t",
    owner: "zaal",
    status: "TODO",
    priority: "P2",
    category: "Other",
    important: false,
    urgent: false,
    due: "",
    notes: "",
    brands: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  }) as ActionItem;

describe("priorityRank", () => {
  it("orders P1 hottest", () => {
    expect(priorityRank("P1")).toBeLessThan(priorityRank("P2"));
    expect(priorityRank("P2")).toBeLessThan(priorityRank("P3"));
  });

  it("treats a missing priority as P2, the create default", () => {
    // 22 open tasks have a null priority. If those ranked as P3 they would
    // sink below deliberately-deprioritised work; if they ranked as P1 they
    // would swamp the top. Neither is right - they are simply unset.
    expect(priorityRank(null)).toBe(priorityRank("P2"));
    expect(priorityRank(undefined)).toBe(priorityRank("P2"));
  });

  it("does not return NaN for a value outside the enum", () => {
    // A bad value reaching a sort comparator makes the whole sort unstable
    // rather than just misplacing one row.
    expect(Number.isNaN(priorityRank("P9" as never))).toBe(false);
  });

  it("PRIORITY_ORDER covers every priority exactly once", () => {
    expect(Object.keys(PRIORITY_ORDER).sort()).toEqual(["P1", "P2", "P3"]);
    expect(new Set(Object.values(PRIORITY_ORDER)).size).toBe(3);
  });
});

describe("byPriority", () => {
  it("sorts P1 before P2 before P3", () => {
    const sorted = [task({ id: "c", priority: "P3" }), task({ id: "a", priority: "P1" }), task({ id: "b", priority: "P2" })]
      .sort(byPriority)
      .map((t) => t.id);
    expect(sorted).toEqual(["a", "b", "c"]);
  });

  it("breaks ties on due date so equal priorities do not shuffle", () => {
    // Without a deterministic tiebreak the list reorders between renders and
    // the top item appears to move on its own.
    const sorted = [
      task({ id: "later", priority: "P1", due: "2026-09-01" }),
      task({ id: "sooner", priority: "P1", due: "2026-08-01" }),
    ]
      .sort(byPriority)
      .map((t) => t.id);
    expect(sorted).toEqual(["sooner", "later"]);
  });

  it("puts undated work after dated work at the same priority", () => {
    const sorted = [
      task({ id: "undated", priority: "P1", due: "" }),
      task({ id: "dated", priority: "P1", due: "2026-08-01" }),
    ]
      .sort(byPriority)
      .map((t) => t.id);
    expect(sorted).toEqual(["dated", "undated"]);
  });

  it("is a consistent comparator (a<b implies b>a)", () => {
    const a = task({ priority: "P1" });
    const b = task({ priority: "P3" });
    expect(Math.sign(byPriority(a, b))).toBe(-Math.sign(byPriority(b, a)));
    expect(byPriority(a, a)).toBe(0);
  });
});

describe("isHot", () => {
  it("counts an urgent task as hot at any priority", () => {
    expect(isHot(task({ urgent: true, priority: "P3" }))).toBe(true);
  });

  it("counts P1 as hot without the urgent flag", () => {
    // 35 of the 40 open P1 tasks carry urgent=false. If P1 alone did not
    // qualify, almost every P1 would be excluded from the hot path.
    expect(isHot(task({ priority: "P1", urgent: false }))).toBe(true);
  });

  it("does not treat ordinary work as hot", () => {
    expect(isHot(task({ priority: "P2", urgent: false }))).toBe(false);
  });

  it("ignores serviceClass, which is uniformly Standard and set on nothing", () => {
    // The old focus.ts ranker keyed its top-weighted branch on
    // serviceClass === "Expedite". No open task has ever had it, so that
    // branch was unreachable. Regression guard: hotness must not depend on
    // a field nobody sets.
    expect(isHot(task({ serviceClass: "Expedite", priority: "P3", urgent: false } as Partial<ActionItem>))).toBe(false);
  });

  it("counts `important` as hot - Zaal ruled 2026-07-29 to wire it, not drop it", () => {
    // This test previously asserted the OPPOSITE, pinning "important does
    // nothing" as a decision on the record. The decision changed, so the
    // assertion changed with it. It still ranks BELOW urgent/overdue in
    // focus.ts - hot enough to surface, not hot enough to flood.
    expect(isHot(task({ important: true, priority: "P2", urgent: false }))).toBe(true);
  });
});

describe("DEPRECATED_AXES", () => {
  it("names the axes that exist but rank nothing", () => {
    // `important` came off this list on 2026-07-29 when it was wired in.
    expect([...DEPRECATED_AXES]).toEqual(["serviceClass", "phase"]);
    expect([...DEPRECATED_AXES]).not.toContain("important");
  });
});
