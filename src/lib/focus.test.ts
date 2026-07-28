import { describe, expect, it } from "vitest";
import { computeTopFive } from "./focus";
import type { ActionItem } from "./types";

// computeTopFive answers "what should I work on right now". It had no
// coverage, and its highest-weighted branch was dead code: it keyed on
// serviceClass === "Expedite", which is set on 0 of 309 open tasks.

// Fixtures are FRESH by default. isStale fires on anything untouched for 5+
// days, so a fixed past date would have made almost every task stale and
// quietly given every test a reason it did not ask for.
const fresh = () => new Date().toISOString();

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
    createdAt: fresh(),
    updatedAt: fresh(),
    ...over,
  }) as ActionItem;

const ids = (entries: ReturnType<typeof computeTopFive>) => entries.map((e) => e.task.id);

describe("computeTopFive - urgent replaces the dead Expedite branch", () => {
  it("puts my urgent task at the top", () => {
    const out = computeTopFive(
      [task({ id: "normal", owner: "zaal", status: "WIP", priority: "P1" }), task({ id: "hot", owner: "zaal", urgent: true })],
      "zaal",
    );
    expect(ids(out)[0]).toBe("hot");
    expect(out[0].reasons).toContain("urgent");
  });

  it("does NOT surface someone else's urgent task on my list", () => {
    // This is the regression that matters. The branch it replaced (Expedite)
    // was deliberately any-owner, because Expedite meant "the workspace drops
    // everything". `urgent` is a personal flag - 16 of the 19 urgent open
    // tasks belong to one person. Left any-owner, the intern's top-5 would be
    // entirely someone else's urgent work and none of his own.
    const out = computeTopFive([task({ id: "zaals", owner: "zaal", urgent: true })], "iman");
    expect(ids(out)).not.toContain("zaals");
  });

  it("ignores serviceClass entirely", () => {
    // Regression guard on the actual bug: a field set on nothing must not be
    // able to claim the top slot.
    const out = computeTopFive(
      [task({ id: "exp", owner: "zaal", serviceClass: "Expedite" } as Partial<ActionItem>)],
      "zaal",
    );
    expect(ids(out)).not.toContain("exp");
  });

  it("still ranks an overdue task of mine", () => {
    const out = computeTopFive(
      [task({ id: "late", owner: "zaal", due: "2026-01-01" })],
      "zaal",
    );
    expect(out[0].reasons).toContain("overdue");
  });

  it("ranks urgent above overdue", () => {
    const out = computeTopFive(
      [task({ id: "late", owner: "zaal", due: "2026-01-01" }), task({ id: "hot", owner: "zaal", urgent: true })],
      "zaal",
    );
    expect(ids(out)[0]).toBe("hot");
  });

  it("returns nothing for a task with no reason at all", () => {
    // The list is a signal, not a dump of the board. A task nobody needs to
    // look at today must not appear just to fill five slots.
    expect(computeTopFive([task({ id: "quiet", owner: "zaal" })], "zaal")).toHaveLength(0);
  });

  it("caps at five", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      task({ id: `u${i}`, owner: "zaal", urgent: true }),
    );
    expect(computeTopFive(many, "zaal")).toHaveLength(5);
  });

  it("treats a Both-owned task as mine", () => {
    const out = computeTopFive([task({ id: "shared", owner: "Both", urgent: true })], "iman");
    expect(ids(out)).toContain("shared");
  });
});
