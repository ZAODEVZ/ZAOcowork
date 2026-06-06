import { describe, it, expect } from "vitest";
import { parseText } from "./todo-parser";

// detectOwner is internal; exercise it through the public parseText. With no
// existing items, an owner-prefixed task-like line becomes a "create" action
// pre-assigned to that owner (audit #9 — used to only know Iman/Zaal/Both).
describe("parseText owner detection (audit #9)", () => {
  it("assigns ThyRev and strips the owner prefix from the title", () => {
    const a = parseText("ThyRev: finish the deploy script", [])[0];
    expect(a.type).toBe("create");
    if (a.type === "create") {
      expect(a.owner).toBe("ThyRev");
      expect(a.claimable).toBe(false);
      expect(a.title.toLowerCase()).not.toContain("thyrev");
    }
  });

  it("assigns Samantha", () => {
    const a = parseText("samantha review the cover artwork", [])[0];
    expect(a.type === "create" ? a.owner : null).toBe("Samantha");
  });

  it("assigns Tyler", () => {
    const a = parseText("tyler send the recap video", [])[0];
    expect(a.type === "create" ? a.owner : null).toBe("Tyler");
  });

  it("leaves an unowned task-like line claimable", () => {
    const a = parseText("build a new landing page", [])[0];
    expect(a.type === "create" ? a.claimable : null).toBe(true);
    expect(a.type === "create" ? a.owner : "x").toBeNull();
  });
});
