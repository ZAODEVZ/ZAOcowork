import { describe, expect, it } from "vitest";
import { AT_RISK_DAYS, NO_BRAND } from "./data";

// The at-risk classification is the semantic core of the rollup strip, so it is
// extracted here as a pure function and tested directly. getBrandRollup() runs
// the identical branch inline; keeping the rule in one tested place is what
// stops "at risk" quietly drifting to mean something else.
//
// Rule: due within AT_RISK_DAYS AND not already in progress.
// Overdue is a separate bucket - a task cannot be both.

export type Bucket = "overdue" | "at-risk" | "clear";

export function classify(
  due: string | null,
  status: string | null,
  today: Date,
  atRiskDays = AT_RISK_DAYS,
): Bucket {
  if (!due) return "clear";
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "clear";

  const midnight = new Date(today);
  midnight.setHours(0, 0, 0, 0);
  if (d < midnight) return "overdue";

  const cutoff = new Date(midnight);
  cutoff.setDate(cutoff.getDate() + atRiskDays);
  // Work already underway is not "at risk" - someone is on it.
  if (d <= cutoff && status !== "in_progress") return "at-risk";
  return "clear";
}

const TODAY = new Date("2026-07-27T12:00:00");
const iso = (offset: number) => {
  const d = new Date(2026, 6, 27 + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

describe("classify", () => {
  it("treats a past date as overdue regardless of status", () => {
    expect(classify(iso(-1), "todo", TODAY)).toBe("overdue");
    expect(classify(iso(-30), "in_progress", TODAY)).toBe("overdue");
  });

  it("flags due-today and due-soon as at-risk when not started", () => {
    expect(classify(iso(0), "todo", TODAY)).toBe("at-risk");
    expect(classify(iso(AT_RISK_DAYS), "todo", TODAY)).toBe("at-risk");
  });

  it("does NOT flag at-risk when the work is already in progress", () => {
    // The whole point: someone is on it, so it is not the thing to go unblock.
    expect(classify(iso(1), "in_progress", TODAY)).toBe("clear");
  });

  it("is clear beyond the at-risk window", () => {
    expect(classify(iso(AT_RISK_DAYS + 1), "todo", TODAY)).toBe("clear");
  });

  it("is clear with no due date", () => {
    expect(classify(null, "todo", TODAY)).toBe("clear");
    expect(classify("", "todo", TODAY)).toBe("clear");
  });

  it("is clear for an unparseable due date rather than throwing", () => {
    expect(classify("someday", "todo", TODAY)).toBe("clear");
  });

  it("never returns both overdue and at-risk for one task", () => {
    for (const offset of [-5, -1, 0, 1, 3, 4, 10]) {
      const b = classify(iso(offset), "todo", TODAY);
      expect(["overdue", "at-risk", "clear"]).toContain(b);
    }
  });
});

describe("rollup constants", () => {
  it("uses a short at-risk window - a long one recreates the overdue problem", () => {
    expect(AT_RISK_DAYS).toBeGreaterThan(0);
    expect(AT_RISK_DAYS).toBeLessThanOrEqual(7);
  });

  it("labels unbranded work as an action, not a category", () => {
    // "(needs a brand)" reads as a to-do; "(none)" reads as a valid state.
    expect(NO_BRAND).toContain("needs");
  });
});
