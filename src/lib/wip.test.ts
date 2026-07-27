import { describe, expect, it } from "vitest";
import { computeWip, wipFor, wipWarning, DEFAULT_WIP_LIMIT } from "./wip";
import type { ActionItem } from "./types";

function task(over: Partial<ActionItem>): ActionItem {
  return {
    id: "1",
    title: "t",
    createdBy: "",
    owner: "Open",
    status: "WIP",
    category: "Other",
    priority: "P2",
    important: false,
    urgent: false,
    completedAt: "",
    completedBy: "",
    phase: "Define",
    due: "",
    notes: "",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    brands: [],
    ...over,
  } as ActionItem;
}

describe("computeWip", () => {
  it("counts only WIP", () => {
    const items = [
      task({ owner: "Zaal", status: "WIP" }),
      task({ owner: "Zaal", status: "TODO" }),
      task({ owner: "Zaal", status: "DONE" }),
      task({ owner: "Zaal", status: "BLOCKED" }),
    ];
    expect(computeWip(items)).toEqual([{ slug: "zaal", count: 1, over: false }]);
  });

  it("is case-insensitive on the owner", () => {
    const items = [task({ owner: "Zaal" }), task({ owner: "zaal" }), task({ owner: "ZAAL" })];
    expect(computeWip(items)[0]).toEqual({ slug: "zaal", count: 3, over: false });
  });

  it("counts a shared task against every assignee", () => {
    const items = [task({ owner: "Open", assignees: ["zaal", "iman"] })];
    const wip = computeWip(items);
    expect(wip).toHaveLength(2);
    expect(wip.map((e) => e.slug).sort()).toEqual(["iman", "zaal"]);
  });

  it("excludes unowned and archived work", () => {
    const items = [
      task({ owner: "Open" }),
      task({ owner: "" }),
      task({ owner: "Both" }),
      task({ owner: "Zaal", archivedAt: "2026-07-02T00:00:00Z" }),
    ];
    expect(computeWip(items)).toEqual([]);
  });

  it("flags over-limit and sorts busiest first", () => {
    const items = [
      ...Array.from({ length: 6 }, () => task({ owner: "Zaal" })),
      ...Array.from({ length: 2 }, () => task({ owner: "Iman" })),
    ];
    const wip = computeWip(items, 5);
    expect(wip[0]).toEqual({ slug: "zaal", count: 6, over: true });
    expect(wip[1]).toEqual({ slug: "iman", count: 2, over: false });
  });

  it("treats exactly at the limit as within it", () => {
    const items = Array.from({ length: 5 }, () => task({ owner: "Zaal" }));
    expect(computeWip(items, 5)[0].over).toBe(false);
  });
});

describe("wipFor", () => {
  it("returns a zero entry for someone with nothing in progress", () => {
    expect(wipFor([], "iman")).toEqual({ slug: "iman", count: 0, over: false });
  });

  it("normalises the queried slug", () => {
    const items = [task({ owner: "zaal" })];
    expect(wipFor(items, "  ZAAL ").count).toBe(1);
  });
});

describe("wipWarning", () => {
  it("is null within the limit", () => {
    const items = Array.from({ length: 3 }, () => task({ owner: "Zaal" }));
    expect(wipWarning(items, "zaal", 5)).toBeNull();
  });

  it("names the count and the limit when over", () => {
    const items = Array.from({ length: 7 }, () => task({ owner: "Zaal" }));
    expect(wipWarning(items, "zaal", 5)).toBe(
      "7 in progress (limit 5) - finish one before starting another",
    );
  });

  it("has a sane default limit", () => {
    expect(DEFAULT_WIP_LIMIT).toBeGreaterThan(0);
  });
});
