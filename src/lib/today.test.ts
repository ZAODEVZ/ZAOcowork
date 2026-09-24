import { describe, expect, it } from "vitest";
import { bucket, addDays, dueOf, daysLate, todayInFestivalTz } from "./today";
import type { ActionItem } from "./types";

// /today decides what Zaal sees first out of 432 live items. Two failures would
// be invisible and expensive: an item counted in two buckets (the day looks
// bigger than it is) and an undated item counted in none (the 44 cards no sweep
// could see, two of them ZAOstock items nobody had reported).

function item(over: Partial<ActionItem> & { id: string }): ActionItem {
  return {
    title: `task ${over.id}`,
    createdBy: "test",
    owner: "zaal",
    status: over.status ?? "TODO",
    category: "ops",
    priority: over.priority ?? "P2",
    important: false,
    urgent: false,
    completedAt: "",
    completedBy: "",
    phase: "now",
    due: over.due ?? "",
    notes: "",
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
    ...over,
  } as ActionItem;
}

const NOW = "2026-09-24";

describe("bucket", () => {
  it("puts a past due date in overdue and nowhere else", () => {
    const b = bucket([item({ id: "1", due: "2026-09-20" })], NOW);
    expect(b.overdue.map((i) => i.id)).toEqual(["1"]);
    expect([...b.dueToday, ...b.inFlight, ...b.thisWeek, ...b.undated]).toHaveLength(0);
  });

  it("puts today's date in dueToday", () => {
    const b = bucket([item({ id: "1", due: NOW })], NOW);
    expect(b.dueToday.map((i) => i.id)).toEqual(["1"]);
    expect(b.overdue).toHaveLength(0);
  });

  it("KEEPS AN UNDATED ITEM VISIBLE - the reason this page exists", () => {
    // 44 open cards had no due date on 2026-09-24 and every date-ordered sweep
    // skipped them. If this test fails they have gone invisible again.
    const b = bucket([item({ id: "1", due: "" })], NOW);
    expect(b.undated.map((i) => i.id)).toEqual(["1"]);
  });

  it("treats a null-ish due the same as an empty one", () => {
    const b = bucket([item({ id: "1", due: undefined as unknown as string })], NOW);
    expect(b.undated.map((i) => i.id)).toEqual(["1"]);
  });

  it("never lets one item appear in two buckets", () => {
    const items = [
      item({ id: "1", due: "2026-09-20" }),
      item({ id: "2", due: NOW }),
      item({ id: "3", due: "2026-09-26" }),
      item({ id: "4", due: "" }),
      item({ id: "5", status: "WIP" }),
      item({ id: "6", status: "WIP", due: "2026-09-20" }),
      item({ id: "7", due: "2026-12-01" }),
    ];
    const b = bucket(items, NOW);
    const seen = [...b.overdue, ...b.dueToday, ...b.inFlight, ...b.thisWeek, ...b.undated].map((i) => i.id);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("an overdue WIP item is overdue, not in flight", () => {
    const b = bucket([item({ id: "6", status: "WIP", due: "2026-09-20" })], NOW);
    expect(b.overdue.map((i) => i.id)).toEqual(["6"]);
    expect(b.inFlight).toHaveLength(0);
  });

  it("drops a DONE item from every bucket", () => {
    const b = bucket([item({ id: "1", status: "DONE", due: "2026-09-20" }), item({ id: "2", status: "DONE", due: "" })], NOW);
    expect([...b.overdue, ...b.dueToday, ...b.inFlight, ...b.thisWeek, ...b.undated]).toHaveLength(0);
  });

  it("a far-future date is in none of the near buckets", () => {
    const b = bucket([item({ id: "7", due: "2026-12-01" })], NOW);
    expect([...b.overdue, ...b.dueToday, ...b.inFlight, ...b.thisWeek, ...b.undated]).toHaveLength(0);
  });

  it("includes the last day of the window and excludes the day after", () => {
    const b = bucket([item({ id: "in", due: addDays(NOW, 7) }), item({ id: "out", due: addDays(NOW, 8) })], NOW);
    expect(b.thisWeek.map((i) => i.id)).toEqual(["in"]);
  });

  it("orders overdue oldest first, so the longest wait is at the top", () => {
    const b = bucket(
      [item({ id: "recent", due: "2026-09-23" }), item({ id: "ancient", due: "2026-08-01" })],
      NOW,
    );
    expect(b.overdue.map((i) => i.id)).toEqual(["ancient", "recent"]);
  });

  it("orders due-today by priority", () => {
    const b = bucket(
      [item({ id: "low", due: NOW, priority: "P3" }), item({ id: "high", due: NOW, priority: "P1" })],
      NOW,
    );
    expect(b.dueToday.map((i) => i.id)).toEqual(["high", "low"]);
  });

  it("counts every open item exactly once across the five buckets, for the near set", () => {
    const items = [
      item({ id: "a", due: "2026-09-20" }),
      item({ id: "b", due: NOW }),
      item({ id: "c", due: "2026-09-26" }),
      item({ id: "d", due: "" }),
      item({ id: "e", status: "WIP" }),
    ];
    const b = bucket(items, NOW);
    const total = b.overdue.length + b.dueToday.length + b.inFlight.length + b.thisWeek.length + b.undated.length;
    expect(total).toBe(items.length);
  });
});

describe("todayInFestivalTz", () => {
  it("reads the festival's own day, not the server's", () => {
    // 2026-09-25T01:30Z is still the 24th in Ellsworth. A UTC cutoff would call
    // it the 25th and sweep a day of items into OVERDUE every evening.
    expect(todayInFestivalTz(Date.parse("2026-09-25T01:30:00Z"))).toBe("2026-09-24");
    expect(todayInFestivalTz(Date.parse("2026-09-25T13:00:00Z"))).toBe("2026-09-25");
  });
});

describe("helpers", () => {
  it("addDays crosses a month boundary", () => {
    expect(addDays("2026-09-28", 7)).toBe("2026-10-05");
  });
  it("addDays crosses a DST change without slipping a day", () => {
    // 2026-11-01 is the US fall-back. A naive local-midnight walk lands on the
    // wrong day here; the noon-UTC anchor does not.
    expect(addDays("2026-10-29", 7)).toBe("2026-11-05");
  });
  it("dueOf trims a timestamp down to the date the table shows", () => {
    expect(dueOf({ due: "2026-10-03T00:00:00Z" })).toBe("2026-10-03");
    expect(dueOf({ due: "" })).toBe("");
  });
  it("daysLate counts whole days", () => {
    expect(daysLate("2026-09-20", "2026-09-24")).toBe(4);
    expect(daysLate("2026-09-24", "2026-09-24")).toBe(0);
  });
});
