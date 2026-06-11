import { describe, it, expect } from "vitest";
import { assignPersistedId, looksLikeUuid } from "./data";
import type { ActionItem } from "./types";

// getItem() routes to the `id` (uuid) column vs the `legacy_id` (#N) column by
// shape — querying the uuid column with a numeric value errors in Postgres.
describe("looksLikeUuid", () => {
  it("is true for a UUID primary key", () => {
    expect(looksLikeUuid("11111111-2222-3333-4444-555555555555")).toBe(true);
  });
  it("is false for a numeric legacy_id (the #N route key)", () => {
    expect(looksLikeUuid("467")).toBe(false);
    expect(looksLikeUuid("1")).toBe(false);
  });
  it("is false for a slug or empty string", () => {
    expect(looksLikeUuid("meeting-jose-onb")).toBe(false);
    expect(looksLikeUuid("")).toBe(false);
  });
});

// assignPersistedId is the read-back step after a create INSERT: the app/bot
// inserts with legacy_id = NULL, the `tasks_slug_guard` trigger assigns the
// number, and this writes the real identity back onto the in-memory item.
function tmpItem(): ActionItem {
  return { id: "optimistic-placeholder", title: "x" } as unknown as ActionItem;
}

describe("assignPersistedId", () => {
  it("takes the DB-assigned numeric legacy_id as the app id, the UUID as dbId", () => {
    const item = tmpItem();
    assignPersistedId(item, { id: "11111111-2222-3333-4444-555555555555", legacy_id: "467" });
    expect(item.id).toBe("467");
    expect(item.dbId).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("overwrites the optimistic placeholder id with the persisted value", () => {
    const item = tmpItem();
    expect(item.id).toBe("optimistic-placeholder");
    assignPersistedId(item, { id: "uuid-x", legacy_id: "900" });
    expect(item.id).toBe("900");
  });

  it("falls back to the UUID when no legacy_id was assigned (trigger absent)", () => {
    const item = tmpItem();
    assignPersistedId(item, { id: "uuid-abc", legacy_id: null });
    expect(item.id).toBe("uuid-abc");
    expect(item.dbId).toBe("uuid-abc");
  });
});
