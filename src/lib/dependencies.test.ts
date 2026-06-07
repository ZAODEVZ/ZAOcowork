import { describe, it, expect } from "vitest";
import { dependencyCycleExists } from "./dependencies";

// edges: blocker_id blocks blocked_id. Adding blocker->blocked is a cycle if
// blocked already (transitively) blocks blocker.
describe("dependencyCycleExists", () => {
  it("false on an empty graph", () => {
    expect(dependencyCycleExists([], "A", "B")).toBe(false);
  });

  it("detects a direct back-edge (B already blocks A)", () => {
    // B -> A exists; adding A -> B would loop.
    const edges = [{ blocker_id: "B", blocked_id: "A" }];
    expect(dependencyCycleExists(edges, "A", "B")).toBe(true);
  });

  it("detects a transitive cycle (B->C->A, add A->B)", () => {
    const edges = [
      { blocker_id: "B", blocked_id: "C" },
      { blocker_id: "C", blocked_id: "A" },
    ];
    expect(dependencyCycleExists(edges, "A", "B")).toBe(true);
  });

  it("false when there's no path back", () => {
    const edges = [
      { blocker_id: "X", blocked_id: "Y" },
      { blocker_id: "Y", blocked_id: "Z" },
    ];
    expect(dependencyCycleExists(edges, "A", "B")).toBe(false);
  });

  it("self-dependency is a cycle", () => {
    expect(dependencyCycleExists([], "A", "A")).toBe(true);
  });

  it("terminates on an existing loop in the data (no infinite loop)", () => {
    const edges = [
      { blocker_id: "P", blocked_id: "Q" },
      { blocker_id: "Q", blocked_id: "P" },
    ];
    // Should return without hanging; P reaches Q but not the target T.
    expect(dependencyCycleExists(edges, "P", "T")).toBe(false);
  });
});
