import { describe, expect, it } from "vitest";
import { normalizeItem, newId, looksLikeUuid, NO_BRAND, UNOWNED, AT_RISK_DAYS, ARCHIVE_DAYS } from "./data";
import type { ActionItem } from "./types";

// data.ts is 972 lines and runs every read and write on the board, with
// essentially no coverage before this. These are the pure parts - the ones that
// silently shape every row that enters the system.
//
// normalizeItem in particular is the funnel: every task from the web, the
// Telegram bot, a meeting capture and the bot API passes through it. A wrong
// default here is a wrong default everywhere, and it would not throw.

describe("normalizeItem - defaults every writer depends on", () => {
  const bare = () => normalizeItem({ id: "1", title: "t" });

  it("fills the required shape from a bare row", () => {
    const it = bare();
    expect(it.owner).toBe("Open");
    expect(it.status).toBe("TODO");
    expect(it.priority).toBe("P2");
    expect(it.category).toBe("Other");
    expect(it.phase).toBe("Define");
    expect(it.brands).toEqual([]);
  });

  it("defaults updatedAt to createdAt, not to now", () => {
    // If these drift apart on creation, every freshly-created task looks
    // already-edited and "stale since" maths is wrong from birth.
    const it = normalizeItem({ id: "1", title: "t", createdAt: "2026-01-01T00:00:00Z" });
    expect(it.updatedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("coerces important/urgent to real booleans", () => {
    const it = normalizeItem({
      id: "1", title: "t",
      important: "yes" as unknown as boolean,
      urgent: 0 as unknown as boolean,
    });
    expect(it.important).toBe(true);
    expect(it.urgent).toBe(false);
  });

  it("never lets brands be a non-array", () => {
    // brands is text[] in Postgres; a scalar here would break every
    // .includes() and the whole brand-grouping view.
    const it = normalizeItem({ id: "1", title: "t", brands: "WaveWarZ" as unknown as string[] });
    expect(Array.isArray(it.brands)).toBe(true);
    expect(it.brands).toEqual([]);
  });

  it("preserves an explicit owner and status", () => {
    const it = normalizeItem({ id: "1", title: "t", owner: "iman", status: "WIP" });
    expect(it.owner).toBe("iman");
    expect(it.status).toBe("WIP");
  });

  it("carries dbId through - losing it turns an UPDATE into an INSERT", () => {
    // This exact bug caused 500s on every full task-panel save: without dbId,
    // applyDiff treats the row as new and trips the unique constraint.
    const it = normalizeItem({ id: "1", title: "t", dbId: "uuid-here" });
    expect(it.dbId).toBe("uuid-here");
  });

  it("keeps optional fields absent rather than undefined-filled", () => {
    const it = bare();
    expect("taskType" in it).toBe(false);
    expect("serviceClass" in it).toBe(false);
  });

  it("preserves optional fields when supplied", () => {
    const it = normalizeItem({ id: "1", title: "t", serviceClass: "Expedite", projectId: "p1" });
    expect(it.serviceClass).toBe("Expedite");
    expect(it.projectId).toBe("p1");
  });
});

describe("newId", () => {
  const mk = (id: string) => ({ id, title: "t" }) as ActionItem;

  it("returns max+1", () => {
    expect(newId([mk("1"), mk("7"), mk("3")])).toBe("8");
  });

  it("starts at 1 on an empty board", () => {
    expect(newId([])).toBe("1");
  });

  it("ignores non-numeric ids rather than producing NaN", () => {
    // Ids from other sources (uuids, "meeting-5") must not poison the counter.
    expect(newId([mk("abc"), mk("meeting-5"), mk("4")])).toBe("5");
  });

  it("is not relied on for persistence - the DB trigger owns the real id", () => {
    // Documented here because it is easy to assume newId is authoritative.
    // insertItem sets legacy_id = NULL and reads the assigned id back.
    expect(newId([mk("9")])).toBe("10");
  });
});

describe("looksLikeUuid", () => {
  it("accepts a real uuid", () => {
    expect(looksLikeUuid("511dfe3d-be66-4ff0-b100-917a2d59ec68")).toBe(true);
  });

  it("rejects legacy numeric ids - routing these to the uuid column errors in PG", () => {
    expect(looksLikeUuid("617")).toBe(false);
    expect(looksLikeUuid("meeting-5")).toBe(false);
    expect(looksLikeUuid("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(looksLikeUuid("511DFE3D-BE66-4FF0-B100-917A2D59EC68")).toBe(true);
  });
});

describe("shared constants", () => {
  it("labels unbranded/unowned as actions, not categories", () => {
    // "(needs a brand)" reads as a to-do; "(none)" reads as a valid state.
    expect(NO_BRAND).toContain("needs");
    expect(UNOWNED).toContain("needs");
  });

  it("keeps the at-risk window short and the archive window long", () => {
    expect(AT_RISK_DAYS).toBeGreaterThan(0);
    expect(AT_RISK_DAYS).toBeLessThan(ARCHIVE_DAYS);
  });
});
