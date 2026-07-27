import { describe, expect, it } from "vitest";
import {
  fallbackTeamOptions,
  mergeOwnerOptions,
  ownerLabel,
  ownerSlug,
  PSEUDO_OWNERS,
  type TeamOption,
} from "./team-options";

// The real shape of the roster as of the 2026-07-26 audit: 14 active members,
// with legacy_owner casing inconsistent between them.
const ROSTER: TeamOption[] = [
  { slug: "aziz", name: "Aziz" },
  { slug: "dcoop", name: "Dcoop" },
  { slug: "iman", name: "Iman" },
  { slug: "jango", name: "JANGO" },
  { slug: "jose", name: "Jose" },
  { slug: "zaal", name: "Zaal" },
];

describe("ownerSlug", () => {
  it("lowercases and trims", () => {
    expect(ownerSlug("  Zaal ")).toBe("zaal");
    expect(ownerSlug("ThyRev")).toBe("thyrev");
  });

  it("handles nullish", () => {
    expect(ownerSlug(null)).toBe("");
    expect(ownerSlug(undefined)).toBe("");
  });
});

describe("fallbackTeamOptions", () => {
  it("excludes the pseudo-owners", () => {
    const slugs = fallbackTeamOptions().map((o) => o.slug);
    for (const p of PSEUDO_OWNERS) {
      expect(slugs).not.toContain(p.toLowerCase());
    }
  });

  it("returns lowercase slugs", () => {
    for (const o of fallbackTeamOptions()) {
      expect(o.slug).toBe(o.slug.toLowerCase());
    }
  });
});

describe("ownerLabel", () => {
  it("maps a slug to the roster display name regardless of input casing", () => {
    expect(ownerLabel("dcoop", ROSTER)).toBe("Dcoop");
    expect(ownerLabel("JANGO", ROSTER)).toBe("JANGO");
    expect(ownerLabel("Jose", ROSTER)).toBe("Jose");
    expect(ownerLabel("jose", ROSTER)).toBe("Jose");
  });

  it("title-cases a bare slug for someone off the roster", () => {
    // A deactivated member still owning historical work must not vanish, but
    // must not render as raw lowercase next to properly-cased names either.
    expect(ownerLabel("ghost", ROSTER)).toBe("Ghost");
  });

  it("preserves the original casing of an off-roster value that has some", () => {
    // Only bare slugs get title-cased; anything already styled is left alone
    // so a name like "McCoy" or "JANGO" is never mangled.
    expect(ownerLabel("McCoy", ROSTER)).toBe("McCoy");
  });

  it("renders pseudo-owners with their canonical casing", () => {
    expect(ownerLabel("open", ROSTER)).toBe("Open");
    expect(ownerLabel("both", ROSTER)).toBe("Both");
  });

  it("treats blank as Open", () => {
    expect(ownerLabel("", ROSTER)).toBe("Open");
    expect(ownerLabel(null, ROSTER)).toBe("Open");
  });
});

describe("mergeOwnerOptions", () => {
  it("returns the roster unchanged when no extra owners are in use", () => {
    expect(mergeOwnerOptions(ROSTER).map((o) => o.slug)).toEqual(
      ROSTER.map((o) => o.slug),
    );
  });

  it("keeps every roster member selectable - the actual audit bug", () => {
    // The hardcoded OWNERS union omitted these; they must survive the merge.
    const slugs = mergeOwnerOptions(ROSTER, ["zaal"]).map((o) => o.slug);
    for (const missing of ["aziz", "dcoop", "jango"]) {
      expect(slugs).toContain(missing);
    }
  });

  it("adds an off-roster owner still present on a task", () => {
    const merged = mergeOwnerOptions(ROSTER, ["ghost"]);
    expect(merged.map((o) => o.slug)).toContain("ghost");
    expect(merged.find((o) => o.slug === "ghost")?.name).toBe("ghost");
  });

  it("does not duplicate an owner already on the roster, whatever the casing", () => {
    const merged = mergeOwnerOptions(ROSTER, ["Zaal", "zaal", "ZAAL"]);
    expect(merged.filter((o) => o.slug === "zaal")).toHaveLength(1);
  });

  it("never adds pseudo-owners as people", () => {
    const slugs = mergeOwnerOptions(ROSTER, ["Open", "Both", ""]).map((o) => o.slug);
    expect(slugs).not.toContain("open");
    expect(slugs).not.toContain("both");
    expect(slugs).not.toContain("");
  });

  it("ignores blank and whitespace owner values", () => {
    const merged = mergeOwnerOptions(ROSTER, ["", "   ", null as unknown as string]);
    expect(merged.map((o) => o.slug)).toEqual(ROSTER.map((o) => o.slug));
  });
});
