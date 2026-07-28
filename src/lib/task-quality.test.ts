import { describe, expect, it } from "vitest";
import {
  checkVagueTitle,
  findSimilar,
  titleSimilarity,
  normalizeTitle,
  MIN_TITLE_WORDS,
} from "./task-quality";

// Fixtures are REAL titles currently on the board, not invented ones - the
// point of these tests is that the nudge fires on the actual junk and stays
// quiet on the actual good tasks.

describe("checkVagueTitle", () => {
  it("flags the bare-date titles that exist today", () => {
    for (const t of ["Monday 20/07/2026", "Tue 21/07/2026", "27/07/2026 tasks"]) {
      expect(checkVagueTitle(t)?.kind).toBe("vague");
    }
  });

  it("flags a title that is only a brand name", () => {
    const w = checkVagueTitle("ZAOstock", ["ZAOstock", "WaveWarZ"]);
    expect(w?.kind).toBe("vague");
    expect(w?.message).toContain("only a brand name");
  });

  it("flags short filler titles", () => {
    expect(checkVagueTitle("micky july week todos")?.kind).toBe("vague");
    expect(checkVagueTitle("Iman The ZAO Todos")?.kind).toBe("vague");
  });

  it("stays QUIET on real, workable titles", () => {
    // False positives are worse than misses here - a nagging form gets ignored.
    for (const t of [
      "Fix Cloudinary key permissions so gallery uploads work again",
      "Send Chesnee the 1080 ZAOstock image for Maine Craft Weekend",
      "Register zabalgamez.com in Google Search Console",
      "Onboard Brandon to Discord + WaveWarZ dashboard repo",
    ]) {
      expect(checkVagueTitle(t, ["ZAOstock"])).toBeNull();
    }
  });

  it("ignores the Inbox action / Handoff prefixes when counting words", () => {
    // Those prefixes are added by the writer, not typed by a human.
    expect(checkVagueTitle("Inbox action: ZAOstock", ["ZAOstock"])?.kind).toBe("vague");
  });

  it("returns null for empty (the required-field check owns that)", () => {
    expect(checkVagueTitle("")).toBeNull();
    expect(checkVagueTitle("   ")).toBeNull();
  });

  it("uses a sane word floor", () => {
    expect(MIN_TITLE_WORDS).toBeGreaterThan(2);
    expect(MIN_TITLE_WORDS).toBeLessThan(8);
  });
});

describe("titleSimilarity", () => {
  it("scores a real duplicate pair high", () => {
    // #1253 vs #1265, confirmed duplicates by reading.
    const a = "TOP: Send ZEDF + WZO emails + Sparq DM (biggest $ leverage)";
    const b = "Send the 3 money items: ZEDF email + WZO email + Sparq DM";
    expect(titleSimilarity(a, b)).toBeGreaterThan(0.3);
  });

  it("scores the KNOWN false positives low", () => {
    // These were flagged as duplicates by an earlier naive pass and are not.
    const pairs: Array<[string, string]> = [
      ["Iman: create an MP4 from the month-2 (July) video", "Iman: create the video for month 3 (August)"],
      ["Create TikTok @zaoconcertz clipping account", "Create Instagram @zaoconcertz clipping account (Reels)"],
      ["POIDH: post winner of ZABAL Gamez ad bounty (month 1)", "POIDH: launch ZABAL Gamez ad bounty month 2"],
    ];
    for (const [a, b] of pairs) {
      expect(titleSimilarity(a, b)).toBeLessThan(0.7);
    }
  });

  it("is symmetric and self-identical", () => {
    const a = "Fix the Cloudinary key permissions";
    const b = "Cloudinary key permissions fix";
    expect(titleSimilarity(a, a)).toBe(1);
    expect(titleSimilarity(a, b)).toBeCloseTo(titleSimilarity(b, a), 10);
  });

  it("is 0 against an empty or filler-only title", () => {
    expect(titleSimilarity("anything here", "")).toBe(0);
    expect(titleSimilarity("anything here", "the and to")).toBe(0);
  });
});

describe("findSimilar", () => {
  const existing = [
    { id: "1253", title: "TOP: Send ZEDF + WZO emails + Sparq DM" },
    { id: "617", title: "Fix Cloudinary key permissions - gallery uploads down" },
  ];

  it("finds a near-identical task", () => {
    const w = findSimilar("Send ZEDF WZO emails Sparq DM", existing, 0.5);
    expect(w?.kind).toBe("duplicate");
    expect(w?.relatedIds).toContain("1253");
  });

  it("returns null when nothing is close", () => {
    expect(findSimilar("Design the ZAOstock tour shirt", existing)).toBeNull();
  });

  it("caps at 3 suggestions so the warning stays readable", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      title: "Fix Cloudinary key permissions gallery uploads down",
    }));
    const w = findSimilar("Fix Cloudinary key permissions gallery uploads down", many, 0.5);
    expect(w?.relatedIds?.length).toBe(3);
  });
});

describe("normalizeTitle", () => {
  it("strips writer-added prefixes and punctuation", () => {
    expect(normalizeTitle("Inbox action: Send the thing!")).toBe("send the thing");
    expect(normalizeTitle("Handoff: ZAO brand project")).toBe("zao brand project");
  });
});
