import { describe, it, expect } from "vitest";
import { cycleDays, ageDays, effectiveAssignees, isAssignedTo } from "./types";

describe("effectiveAssignees / isAssignedTo (the 'is this mine?' rule)", () => {
  it("uses the explicit assignees list when present", () => {
    expect(effectiveAssignees({ owner: "Zaal", assignees: ["dcoop", "tyler"] })).toEqual([
      "dcoop",
      "tyler",
    ]);
  });
  it("maps legacy 'Both' to Zaal + Iman ONLY (not everyone)", () => {
    expect(effectiveAssignees({ owner: "Both" })).toEqual(["zaal", "iman"]);
  });
  it("a brand-new person does NOT inherit Both tasks (the 82-todo bug)", () => {
    expect(isAssignedTo({ owner: "Both" }, "dcoop")).toBe(false);
    expect(isAssignedTo({ owner: "Both" }, "zaal")).toBe(true);
  });
  it("treats Open / blank as nobody", () => {
    expect(effectiveAssignees({ owner: "Open" })).toEqual([]);
    expect(effectiveAssignees({ owner: "" })).toEqual([]);
  });
  it("single owner resolves to that one person, case-insensitive", () => {
    expect(isAssignedTo({ owner: "Tyler" }, "tyler")).toBe(true);
    expect(isAssignedTo({ owner: "Tyler" }, "TYLER")).toBe(true);
    expect(isAssignedTo({ owner: "Tyler" }, "iman")).toBe(false);
  });
  it("explicit assignees override the legacy owner field", () => {
    // owner derived as 'Both' for a 2-person task, but only the listed people match.
    expect(isAssignedTo({ owner: "Both", assignees: ["dcoop"] }, "zaal")).toBe(false);
    expect(isAssignedTo({ owner: "Both", assignees: ["dcoop"] }, "dcoop")).toBe(true);
  });
});

describe("cycleDays (uses completedAt, not updatedAt)", () => {
  it("returns null for non-DONE tasks", () => {
    expect(cycleDays("2026-01-01", "2026-01-05", "WIP")).toBeNull();
  });
  it("measures created -> completed, ignoring a later updatedAt", () => {
    expect(
      cycleDays("2026-01-01T00:00:00Z", "2026-01-11T00:00:00Z", "DONE", "2026-03-01T00:00:00Z"),
    ).toBe(10);
  });
  it("falls back to updatedAt when completedAt is empty", () => {
    expect(cycleDays("2026-01-01T00:00:00Z", "", "DONE", "2026-01-06T00:00:00Z")).toBe(5);
  });
  it("returns null when DONE but no end timestamp is available", () => {
    expect(cycleDays("2026-01-01", "", "DONE")).toBeNull();
  });
  it("never returns a negative value", () => {
    expect(cycleDays("2026-01-10T00:00:00Z", "2026-01-01T00:00:00Z", "DONE")).toBe(0);
  });
});

describe("ageDays", () => {
  it("is 0 for a just-created item", () => {
    expect(ageDays(new Date().toISOString())).toBe(0);
  });
  it("counts whole days since creation", () => {
    const fiveDaysAgo = new Date(Date.now() - (5 * 86_400_000 + 3_600_000)).toISOString();
    expect(ageDays(fiveDaysAgo)).toBe(5);
  });
});
