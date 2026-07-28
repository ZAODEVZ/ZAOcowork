import { describe, expect, it } from "vitest";
import { sanitizeFilterTerm } from "./data";

// These reads moved from "pull the whole board, filter in JS" to "filter in
// Postgres". That is the right trade, but it moves user input into a query
// string, so the escaping is now load-bearing in a way the JS filters never
// were: a stray comma in a search box used to be a character that matched
// nothing, and would now be a filter separator.

describe("sanitizeFilterTerm", () => {
  it("leaves ordinary search terms alone", () => {
    expect(sanitizeFilterTerm("cloudinary")).toBe("cloudinary");
    expect(sanitizeFilterTerm("ZAOstock tour shirt")).toBe("ZAOstock tour shirt");
  });

  it("strips the characters that would graft a second condition onto or()", () => {
    // The attack shape: PostgREST splits or() on commas, so an unescaped
    // comma turns one filter into two and the extra one is attacker-chosen.
    const out = sanitizeFilterTerm("a,status.eq.done");
    expect(out).not.toContain(",");
    expect(out).toBe("a status.eq.done");
  });

  it("strips parens, which delimit nested filter groups", () => {
    const out = sanitizeFilterTerm("or(status.eq.done)");
    expect(out).not.toMatch(/[()]/);
  });

  it("strips ilike wildcards so a term cannot widen its own match", () => {
    // "%" would otherwise make "%" match every row rather than no rows.
    expect(sanitizeFilterTerm("%")).toBe("");
    expect(sanitizeFilterTerm("*")).toBe("");
    expect(sanitizeFilterTerm("a%b")).toBe("a b");
  });

  it("strips backslashes so escaping cannot be re-introduced by the caller", () => {
    expect(sanitizeFilterTerm("a\\,b")).not.toContain("\\");
  });

  it("collapses the whitespace it leaves behind", () => {
    // Without this, stripping "(),%" from a term leaves a run of spaces that
    // an ilike would then require to match literally.
    expect(sanitizeFilterTerm("a(),%b")).toBe("a b");
  });

  it("returns empty for input that is entirely unsafe", () => {
    // Callers MUST treat "" as "skip this filter". An empty ilike pattern
    // matches every row, so running it would be the opposite of filtering.
    expect(sanitizeFilterTerm(",,,")).toBe("");
    expect(sanitizeFilterTerm("   ")).toBe("");
    expect(sanitizeFilterTerm("")).toBe("");
  });

  it("keeps characters that are meaningful to a task search", () => {
    // Hyphens, hashes and slashes appear in real titles and ids.
    expect(sanitizeFilterTerm("#617")).toBe("#617");
    expect(sanitizeFilterTerm("pr-test-task")).toBe("pr-test-task");
    expect(sanitizeFilterTerm("co-c-concert-z/upload")).toBe("co-c-concert-z/upload");
  });
});
