import { describe, it, expect } from "vitest";
import { cycleDays, ageDays } from "./types";

describe("cycleDays (audit #8 — must use completedAt, not updatedAt)", () => {
  it("returns null for non-DONE tasks", () => {
    expect(cycleDays("2026-01-01", "2026-01-05", "WIP")).toBeNull();
  });

  it("measures created -> completed, ignoring a later updatedAt", () => {
    // Completed 10 days after creation; a much later edit (updatedAt) must NOT
    // inflate the cycle time.
    expect(
      cycleDays(
        "2026-01-01T00:00:00Z",
        "2026-01-11T00:00:00Z",
        "DONE",
        "2026-03-01T00:00:00Z",
      ),
    ).toBe(10);
  });

  it("falls back to updatedAt when completedAt is empty", () => {
    expect(
      cycleDays("2026-01-01T00:00:00Z", "", "DONE", "2026-01-06T00:00:00Z"),
    ).toBe(5);
  });

  it("returns null when DONE but no end timestamp is available", () => {
    expect(cycleDays("2026-01-01", "", "DONE")).toBeNull();
  });

  it("never returns a negative value", () => {
    expect(
      cycleDays("2026-01-10T00:00:00Z", "2026-01-01T00:00:00Z", "DONE"),
    ).toBe(0);
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
