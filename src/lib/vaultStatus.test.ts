import { describe, expect, it } from "vitest";
import { MAX_ITEMS, MAX_STRING_LEN, parseVaultStatus } from "./vaultStatus";

// The control this schema exists for: prove the validator actually rejects
// what it claims to reject, rather than trusting the code to mean what its
// comments say. See vaultStatus.ts header for the incident this schema
// exists to prevent.

const valid = () => ({
  date: "2026-09-20",
  headline: "A short status line",
  shipped: ["Shipped one thing", "Shipped another"],
  next: ["Do the next thing"],
  updatedAt: "2026-09-20T16:00:00Z",
});

describe("parseVaultStatus", () => {
  it("accepts a well-formed payload", () => {
    const result = parseVaultStatus(valid());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status.headline).toBe("A short status line");
      expect(result.droppedKeys).toEqual([]);
    }
  });

  it("drops an unknown key from the parsed result rather than passing it through", () => {
    const payload = { ...valid(), secretDetail: "a third party's private information" };
    const result = parseVaultStatus(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The unknown key's VALUE must not survive anywhere in the parsed
      // output - this is the actual leak-prevention check.
      expect(JSON.stringify(result.status)).not.toContain("secretDetail");
      expect(JSON.stringify(result.status)).not.toContain("a third party's private information");
      expect(result.droppedKeys).toContain("secretDetail");
    }
  });

  it("refuses the whole payload when a required field is missing", () => {
    const payload = valid() as Record<string, unknown>;
    delete payload.date;
    const result = parseVaultStatus(payload);
    expect(result.ok).toBe(false);
  });

  it("REFUSES an over-cap headline rather than truncating it - truncation is fail-open", () => {
    // This is the core control: a truncated string still publishes the
    // first MAX_STRING_LEN characters of whatever leaked. The only
    // acceptable behavior is a full refusal.
    const tooLong = "x".repeat(MAX_STRING_LEN + 1);
    const payload = { ...valid(), headline: tooLong };
    const result = parseVaultStatus(payload);
    expect(result.ok).toBe(false);
    // Prove it truly refused rather than silently returning a shortened
    // value under `ok: true`.
    if (!result.ok) {
      expect(result.reason).toContain("over the");
    }
  });

  it("REFUSES an over-cap shipped[] entry rather than truncating it", () => {
    const tooLong = "y".repeat(MAX_STRING_LEN + 1);
    const payload = { ...valid(), shipped: ["fine", tooLong] };
    const result = parseVaultStatus(payload);
    expect(result.ok).toBe(false);
  });

  it("a string exactly at the cap is accepted", () => {
    const exact = "z".repeat(MAX_STRING_LEN);
    const payload = { ...valid(), headline: exact };
    const result = parseVaultStatus(payload);
    expect(result.ok).toBe(true);
  });

  it("truncates array overflow rather than refusing - a count problem, not a content problem", () => {
    const payload = { ...valid(), shipped: Array.from({ length: MAX_ITEMS + 3 }, (_, i) => `item ${i}`) };
    const result = parseVaultStatus(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status.shipped).toHaveLength(MAX_ITEMS);
      expect(result.status.shipped[0]).toBe("item 0");
    }
  });

  it("rejects a non-object payload", () => {
    expect(parseVaultStatus(null).ok).toBe(false);
    expect(parseVaultStatus("a string").ok).toBe(false);
    expect(parseVaultStatus(["array"]).ok).toBe(false);
  });

  it("defaults missing optional arrays to empty rather than refusing", () => {
    const payload = valid() as Record<string, unknown>;
    delete payload.shipped;
    delete payload.next;
    const result = parseVaultStatus(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status.shipped).toEqual([]);
      expect(result.status.next).toEqual([]);
    }
  });
});
