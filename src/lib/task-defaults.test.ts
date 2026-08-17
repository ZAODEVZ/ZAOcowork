import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  applyTaskDefaults,
  describeDefaults,
  isUnowned,
  FALLBACK_OWNER,
  FALLBACK_PRIORITY,
  SLA_DAYS,
} from "./task-defaults";
import type { ActionItem } from "./types";

const NOW = new Date("2026-07-26T12:00:00.000Z");

function item(over: Partial<ActionItem> = {}): Partial<ActionItem> {
  return { title: "t", status: "TODO", ...over };
}

describe("isUnowned", () => {
  it("treats Open and blanks as unowned", () => {
    for (const v of ["", "Open", "open", "  ", "unassigned", "none", undefined, null, 7]) {
      expect(isUnowned(v)).toBe(true);
    }
  });

  it("treats a real name as owned", () => {
    expect(isUnowned("Iman")).toBe(false);
    expect(isUnowned("Zaal")).toBe(false);
  });
});

describe("addDaysIso", () => {
  it("adds days and returns YYYY-MM-DD", () => {
    expect(addDaysIso(NOW, 7)).toBe("2026-08-02");
    expect(addDaysIso(NOW, 2)).toBe("2026-07-28");
  });

  it("rolls over month boundaries", () => {
    expect(addDaysIso(new Date("2026-07-30T00:00:00Z"), 7)).toBe("2026-08-06");
  });

  it("is timezone-stable for a late-evening local time", () => {
    // 23:30 UTC-adjacent: naive local-date arithmetic would slip a day here.
    expect(addDaysIso(new Date("2026-07-26T23:30:00.000Z"), 1)).toBe("2026-07-27");
  });
});

describe("applyTaskDefaults", () => {
  it("assigns unowned work to the fallback owner", () => {
    const { item: out, applied } = applyTaskDefaults(item({ owner: "Open" }), NOW);
    expect(out.owner).toBe(FALLBACK_OWNER);
    expect(applied.owner).toBe(true);
  });

  it("leaves a real owner alone", () => {
    const { item: out, applied } = applyTaskDefaults(item({ owner: "Iman" }), NOW);
    expect(out.owner).toBe("Iman");
    expect(applied.owner).toBe(false);
  });

  it("respects assignees over an Open owner string", () => {
    const { item: out, applied } = applyTaskDefaults(
      item({ owner: "Open", assignees: ["iman"] }),
      NOW,
    );
    expect(out.owner).toBe("Open");
    expect(applied.owner).toBe(false);
  });

  it("defaults priority when missing", () => {
    const { item: out, applied } = applyTaskDefaults(item(), NOW);
    expect(out.priority).toBe(FALLBACK_PRIORITY);
    expect(applied.priority).toBe(true);
  });

  it("keeps an explicit priority", () => {
    const { item: out, applied } = applyTaskDefaults(item({ priority: "P1" }), NOW);
    expect(out.priority).toBe("P1");
    expect(applied.priority).toBe(false);
  });

  it("sets due from the service-class SLA", () => {
    const cases: Array<[ActionItem["serviceClass"], number]> = [
      ["Expedite", SLA_DAYS.Expedite],
      ["Standard", SLA_DAYS.Standard],
      ["FixedDate", SLA_DAYS.FixedDate],
      ["Intangible", SLA_DAYS.Intangible],
    ];
    for (const [cls, days] of cases) {
      const { item: out } = applyTaskDefaults(item({ serviceClass: cls }), NOW);
      expect(out.due).toBe(addDaysIso(NOW, days));
    }
  });

  it("falls back to the Standard SLA when no service class is set", () => {
    const { item: out, applied } = applyTaskDefaults(item(), NOW);
    expect(out.due).toBe(addDaysIso(NOW, SLA_DAYS.Standard));
    expect(applied.due).toBe(true);
  });

  it("keeps an explicit due date", () => {
    const { item: out, applied } = applyTaskDefaults(item({ due: "2026-09-01" }), NOW);
    expect(out.due).toBe("2026-09-01");
    expect(applied.due).toBe(false);
  });

  it("replaces an unparseable due date", () => {
    const { item: out, applied } = applyTaskDefaults(item({ due: "someday" }), NOW);
    expect(applied.due).toBe(true);
    expect(out.due).toBe(addDaysIso(NOW, SLA_DAYS.Standard));
  });

  it("never back-fills a DONE task", () => {
    const { item: out, applied } = applyTaskDefaults(
      item({ status: "DONE", owner: "Open", due: "" }),
      NOW,
    );
    expect(out.owner).toBe("Open");
    expect(out.due).toBe("");
    expect(applied).toEqual({ owner: false, priority: false, due: false });
  });

  it("does not mutate the input", () => {
    const input = item({ owner: "Open" });
    const snapshot = JSON.stringify(input);
    applyTaskDefaults(input, NOW);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("describeDefaults", () => {
  it("summarises only what was applied", () => {
    expect(describeDefaults({ owner: true, priority: false, due: true, effort: false })).toBe(
      `owner=${FALLBACK_OWNER}, due=SLA`,
    );
    expect(describeDefaults({ owner: false, priority: false, due: false, effort: false })).toBe("");
  });
});
