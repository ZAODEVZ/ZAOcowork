import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, csvCell, dueUrgency, parseDueDate } from "./board-csv";
import type { ActionItem } from "@/lib/types";

// These were unreachable from a test file while they lived inside the
// 2787-line Board.tsx. Extracting them was the point of the split.

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell("")).toBe("");
  });

  it("quotes values containing a comma", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
  });

  it("quotes and doubles embedded quotes (RFC-4180)", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes values containing a newline", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("CSV_COLUMNS", () => {
  it("survives a task with every optional field missing", () => {
    const bare = { id: "7", title: "t" } as ActionItem;
    const row = CSV_COLUMNS.map((c) => c.get(bare));
    expect(row).not.toContain(undefined);
    expect(row[0]).toBe("7");
    expect(row[1]).toBe("t");
  });

  it("joins brands with a semicolon so the comma stays the delimiter", () => {
    const col = CSV_COLUMNS.find((c) => c.header === "brands")!;
    expect(col.get({ brands: ["ZAO", "WaveWarZ"] } as ActionItem)).toBe("ZAO; WaveWarZ");
  });
});

describe("dueUrgency", () => {
  // dueUrgency compares against LOCAL midnight and parses `${due}T00:00:00`
  // as a local time, so the fixture must be a local date string. Building it
  // with toISOString() (UTC) shifts a day whenever the run happens late in the
  // evening west of UTC, which made these assertions flap by time of day.
  const today = new Date();
  const iso = (offsetDays: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  it("is none without a due date", () => {
    expect(dueUrgency(undefined, "TODO")).toBe("none");
    expect(dueUrgency("", "TODO")).toBe("none");
  });

  it("never flags a DONE task - a shipped task's due date is history", () => {
    expect(dueUrgency(iso(-30), "DONE")).toBe("none");
  });

  it("flags a past date as overdue", () => {
    expect(dueUrgency(iso(-1), "TODO")).toBe("overdue");
  });

  it("flags today and the next two days as soon", () => {
    expect(dueUrgency(iso(0), "TODO")).toBe("soon");
    expect(dueUrgency(iso(2), "TODO")).toBe("soon");
  });

  it("is none beyond the soon window", () => {
    expect(dueUrgency(iso(3), "TODO")).toBe("none");
  });

  it("is none for an unparseable date", () => {
    expect(dueUrgency("someday", "TODO")).toBe("none");
  });
});

describe("parseDueDate", () => {
  it("parses an ISO date", () => {
    expect(parseDueDate("2026-08-01")?.getFullYear()).toBe(2026);
  });

  it("returns null for junk", () => {
    expect(parseDueDate("")).toBeNull();
    expect(parseDueDate("not-a-date")).toBeNull();
  });
});
