import { describe, expect, it } from "vitest";
import {
  asBool,
  asCategory,
  asPriority,
  asServiceClass,
  asStatus,
  asTaskType,
  idsFromForm,
  makeActivity,
  ownerFromAssignees,
  readForm,
  safeHttpUrl,
  smartDefaultPhase,
} from "./task-form";
import type { ActionItem } from "./data";

// actions.ts owns every mutation on the board and had no direct coverage,
// because "use server" modules can only export async functions - so none of
// the pure logic inside could be imported by a test. These are those
// functions, now importable.
//
// readForm is the one that matters most: it is the funnel every web create
// and every task-panel save passes through. The comments in it record real
// outages, so those are what the tests below pin down.

const form = (entries: Array<[string, string]>): FormData => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

const prevItem = (over: Partial<ActionItem> = {}): ActionItem =>
  ({
    id: "617",
    dbId: "511dfe3d-be66-4ff0-b100-917a2d59ec68",
    title: "Existing task",
    owner: "iman",
    status: "TODO",
    priority: "P2",
    category: "Other",
    phase: "Define",
    important: false,
    urgent: false,
    due: "",
    notes: "",
    brands: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "",
    completedBy: "",
    createdBy: "zaal",
    ...over,
  }) as ActionItem;

describe("safeHttpUrl - the XSS gate on stored links", () => {
  // videoUrl and eventUrl are rendered as <a href>. A javascript: URL stored
  // here executes on click for whoever opens the task, not just the author.
  it("rejects javascript: and data: schemes", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects plain http - only https is stored", () => {
    expect(safeHttpUrl("http://example.com/x")).toBeNull();
  });

  it("accepts https and returns it unchanged", () => {
    expect(safeHttpUrl("https://loom.com/share/abc")).toBe("https://loom.com/share/abc");
  });

  it("returns null for empty or unparseable input rather than throwing", () => {
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl("   ")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});

describe("asBool - HTML checkboxes do not send booleans", () => {
  it("accepts every truthy form encoding a checkbox actually produces", () => {
    // An unchecked box sends nothing; a checked one sends "on" by default.
    for (const v of ["1", "true", "on", "yes", "YES", " On "]) {
      expect(asBool(v)).toBe(true);
    }
  });

  it("treats absent and everything else as false", () => {
    for (const v of [undefined, null, "", "0", "false", "off", "no", "banana"]) {
      expect(asBool(v)).toBe(false);
    }
  });

  it("passes real booleans through", () => {
    expect(asBool(true)).toBe(true);
    expect(asBool(false)).toBe(false);
  });
});

describe("enum coercion falls back instead of throwing", () => {
  // These take raw form input. An unknown value must land on a valid default,
  // because a bad enum reaching Postgres is a 500 on save.
  it("defaults unknown values", () => {
    expect(asStatus("NONSENSE")).toBe("TODO");
    expect(asPriority("P9")).toBe("P2");
    expect(asCategory("NotACategory")).toBe("Other");
    expect(asServiceClass("Gold")).toBe("Standard");
  });

  it("preserves valid values", () => {
    expect(asStatus("BLOCKED")).toBe("BLOCKED");
    expect(asPriority("P1")).toBe("P1");
    expect(asServiceClass("Expedite")).toBe("Expedite");
  });

  it("asTaskType returns undefined rather than a default", () => {
    // Unlike the others this field is genuinely optional, so it must not
    // invent a value - normalizeItem keeps absent fields absent.
    expect(asTaskType("nonsense")).toBeUndefined();
  });
});

describe("smartDefaultPhase", () => {
  const soon = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  const past = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  const far = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();

  it("puts DONE work in Control regardless of dates", () => {
    expect(smartDefaultPhase("P1", past, "DONE")).toBe("Control");
  });

  it("treats overdue as Improve", () => {
    expect(smartDefaultPhase("P3", past, "TODO")).toBe("Improve");
  });

  it("treats due-within-a-week as Measure", () => {
    expect(smartDefaultPhase("P3", soon, "TODO")).toBe("Measure");
  });

  it("escalates P1 with no near date to Improve", () => {
    expect(smartDefaultPhase("P1", far, "TODO")).toBe("Improve");
  });

  it("defaults to Define", () => {
    expect(smartDefaultPhase("P3", "", "TODO")).toBe("Define");
  });
});

describe("idsFromForm", () => {
  it("collects every ids entry and drops blanks", () => {
    const f = form([["ids", "1"], ["ids", "  "], ["ids", " 617 "], ["ids", ""]]);
    expect(idsFromForm(f)).toEqual(["1", "617"]);
  });

  it("returns empty when the field is absent - bulk actions no-op on this", () => {
    expect(idsFromForm(new FormData())).toEqual([]);
  });
});

describe("ownerFromAssignees", () => {
  it("maps zero assignees to Open, which is what makes a task claimable", () => {
    expect(ownerFromAssignees([])).toBe("Open");
  });

  it("uses the single assignee's label", () => {
    expect(ownerFromAssignees(["iman"])).toBe(ownerFromAssignees(["iman"]));
    expect(ownerFromAssignees(["iman"])).not.toBe("Open");
  });

  it("collapses multiple assignees to Both", () => {
    expect(ownerFromAssignees(["iman", "zaal"])).toBe("Both");
    expect(ownerFromAssignees(["iman", "zaal", "brandon"])).toBe("Both");
  });
});

describe("makeActivity", () => {
  it("honours an explicit timestamp so a batch shares one time", () => {
    const at = "2026-07-28T12:00:00.000Z";
    expect(makeActivity("zaal", "created", undefined, at).createdAt).toBe(at);
  });

  it("generates distinct ids for events made in the same millisecond", () => {
    const at = "2026-07-28T12:00:00.000Z";
    const ids = new Set(
      Array.from({ length: 50 }, () => makeActivity("zaal", "x", undefined, at).id),
    );
    // Collisions here would make two activity entries indistinguishable.
    expect(ids.size).toBeGreaterThan(40);
  });
});

describe("readForm - the create/edit funnel", () => {
  it("carries dbId through, or an edit becomes an INSERT", () => {
    // This is the bug the comment in readForm records: without dbId the item
    // looks new, applyDiff attempts an INSERT, and the unique constraint
    // 500s every full 'Save Changes' from the task panel.
    const next = readForm(form([["title", "Updated"]]), "617", "zaal", prevItem());
    expect(next.dbId).toBe("511dfe3d-be66-4ff0-b100-917a2d59ec68");
  });

  it("stamps completedAt/By on the TODO -> DONE transition", () => {
    const next = readForm(form([["status", "DONE"]]), "617", "zaal", prevItem());
    expect(next.status).toBe("DONE");
    expect(next.completedAt).not.toBe("");
    expect(next.completedBy).toBe("zaal");
  });

  it("clears completedAt/By when a DONE task is reopened", () => {
    // Otherwise a reopened task keeps a completion date and still counts as
    // shipped in the digest.
    const prev = prevItem({ status: "DONE", completedAt: "2026-01-02T00:00:00.000Z", completedBy: "iman" });
    const next = readForm(form([["status", "WIP"]]), "617", "zaal", prev);
    expect(next.completedAt).toBe("");
    expect(next.completedBy).toBe("");
  });

  it("does not stamp completion for a task created directly as DONE", () => {
    // The transition logic is guarded on `prev` - there is no transition on
    // create, so a new DONE task carries no completion actor.
    const next = readForm(form([["title", "t"], ["status", "DONE"]]), "new", "zaal");
    expect(next.completedBy).toBe("");
  });

  it("marks a task claimable exactly when the owner is Open", () => {
    const open = readForm(form([["title", "t"], ["owner", "Open"]]), "new", "zaal");
    const owned = readForm(form([["title", "t"], ["owner", "iman"]]), "new", "zaal");
    expect(open.claimable).toBe(true);
    expect(owned.claimable).toBe(false);
  });

  it("preserves the previous owner when the form omits one", () => {
    const next = readForm(form([["title", "t"]]), "617", "zaal", prevItem({ owner: "iman" }));
    expect(next.owner).toBe("iman");
  });

  it("keeps comments, updates and activity that the form never carries", () => {
    // The edit form posts scalar fields only. If these were not carried over,
    // saving a title would silently wipe a task's whole discussion.
    const prev = prevItem({
      comments: [{ id: "c1", userId: "iman", displayName: "Iman", content: "hi", createdAt: "2026-01-01T00:00:00.000Z" }],
      activity: [{ id: "a1", userId: "zaal", displayName: "Zaal", action: "created", createdAt: "2026-01-01T00:00:00.000Z" }],
    });
    const next = readForm(form([["title", "Renamed"]]), "617", "zaal", prev);
    expect(next.comments).toHaveLength(1);
    expect(next.activity).toHaveLength(1);
  });

  it("takes multiple brands entries as an array", () => {
    const next = readForm(form([["title", "t"], ["brands", "WaveWarZ"], ["brands", "The ZAO"]]), "new", "zaal");
    expect(next.brands).toEqual(["WaveWarZ", "The ZAO"]);
  });

  it("keeps previous brands when the form sends none", () => {
    const next = readForm(form([["title", "t"]]), "617", "zaal", prevItem({ brands: ["WaveWarZ"] }));
    expect(next.brands).toEqual(["WaveWarZ"]);
  });

  it("infers phase on create but never overrides an existing one", () => {
    const created = readForm(form([["title", "t"], ["priority", "P1"]]), "new", "zaal");
    expect(created.phase).toBe("Improve");

    const edited = readForm(form([["title", "t"], ["priority", "P1"]]), "617", "zaal", prevItem({ phase: "Control" }));
    expect(edited.phase).toBe("Control");
  });

  it("lets an explicit phase win over both inference and the previous value", () => {
    const next = readForm(form([["phase", "Measure"]]), "617", "zaal", prevItem({ phase: "Control" }));
    expect(next.phase).toBe("Measure");
  });

  it("runs videoUrl and eventUrl through the https gate", () => {
    const next = readForm(
      form([["title", "t"], ["videoUrl", "javascript:alert(1)"], ["eventUrl", "https://luma.com/zao"]]),
      "new",
      "zaal",
    );
    expect(next.videoUrl).toBeNull();
    expect(next.eventUrl).toBe("https://luma.com/zao");
  });

  it("only touches requiresApproval when the sentinel field is present", () => {
    // The form sends _hasRequiresApproval=1 to distinguish "unchecked" from
    // "this form does not render the field at all". Without the sentinel an
    // unchecked box would read as false and silently clear the flag.
    const prev = prevItem({ requiresApproval: true } as Partial<ActionItem>);

    const absent = readForm(form([["title", "t"]]), "617", "zaal", prev);
    expect(absent.requiresApproval).toBe(true);

    const present = readForm(
      form([["title", "t"], ["_hasRequiresApproval", "1"]]),
      "617",
      "zaal",
      prev,
    );
    expect(present.requiresApproval).toBe(false);
  });

  it("carries archived state through an edit", () => {
    const next = readForm(form([["title", "t"]]), "617", "zaal", prevItem({ archivedAt: "2026-06-01T00:00:00.000Z" }));
    expect(next.archivedAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("keeps createdAt and createdBy from the original", () => {
    const next = readForm(form([["title", "t"]]), "617", "iman", prevItem());
    expect(next.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(next.createdBy).toBe("zaal");
    expect(next.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
  });

  it("trims whitespace on free-text fields", () => {
    const next = readForm(form([["title", "  Spaced  "], ["notes", "  note  "]]), "new", "zaal");
    expect(next.title).toBe("Spaced");
    expect(next.notes).toBe("note");
  });

  it("treats taskType=event as flagging the task an event", () => {
    const next = readForm(form([["title", "t"], ["taskType", "event"]]), "new", "zaal");
    expect(next.isEvent).toBe(true);
  });
});
