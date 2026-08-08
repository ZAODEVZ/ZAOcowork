import { describe, expect, it } from "vitest";
import {
  applyMention,
  getMentionQuery,
  moveHighlight,
  rankCandidates,
} from "@/lib/mention-autocomplete";
import type { TeamOption } from "@/lib/team-options";

const PEOPLE: TeamOption[] = [
  { slug: "zaal", name: "Zaal" },
  { slug: "iman", name: "Iman" },
  { slug: "samantha", name: "Samantha" },
  { slug: "shawn", name: "Shawn Porter" },
  { slug: "jose", name: "Joseph Goats" },
  { slug: "dcoop", name: "Dcoop" },
];

describe("getMentionQuery - where is the caret", () => {
  it("opens on a bare @ - typing @ is how you ask who is there", () => {
    const q = getMentionQuery("hey @", 5);
    expect(q.active).toBe(true);
    expect(q.query).toBe("");
    expect(q.start).toBe(4);
  });

  it("captures what has been typed so far", () => {
    const q = getMentionQuery("hey @ima", 8);
    expect(q.active).toBe(true);
    expect(q.query).toBe("ima");
  });

  it("opens at the very start of the box", () => {
    expect(getMentionQuery("@za", 3).active).toBe(true);
  });

  it("lowercases the query so matching is case-insensitive", () => {
    expect(getMentionQuery("@IMA", 4).query).toBe("ima");
  });

  // Editing an existing mention mid-word must not swallow the tail.
  it("ends the token at the caret, not the end of the word", () => {
    const q = getMentionQuery("hey @zal", 7);
    expect(q.query).toBe("za");
    expect(q.end).toBe(7);
  });

  it.each([
    ["no @ at all", "hello there", 6],
    ["whitespace after the @", "hey @iman and", 13],
    ["an email address", "mail me at a@b.com", 18],
    ["mid-word @", "user@handle", 11],
  ])("stays closed for %s", (_label, text, caret) => {
    expect(getMentionQuery(text as string, caret as number).active).toBe(false);
  });

  it("stays closed once the token is absurdly long", () => {
    const long = `@${"a".repeat(40)}`;
    expect(getMentionQuery(long, long.length).active).toBe(false);
  });

  it("handles an out-of-range caret without throwing", () => {
    expect(getMentionQuery("hey @i", 99).active).toBe(false);
    expect(getMentionQuery("hey @i", -1).active).toBe(false);
  });
});

describe("rankCandidates - the whole point is seeing everyone", () => {
  // The bug this feature exists to avoid: a picker that shows a stale subset.
  it("an empty query returns the WHOLE roster, not a favourites list", () => {
    const r = rankCandidates("", PEOPLE, { limit: 50 });
    for (const p of PEOPLE) expect(r.map((c) => c.slug)).toContain(p.slug);
  });

  it("prefix matches beat substring matches", () => {
    const r = rankCandidates("sa", PEOPLE, { limit: 50 });
    expect(r[0].slug).toBe("samantha");
  });

  it("matches on display name, not only slug", () => {
    expect(rankCandidates("goats", PEOPLE).map((c) => c.slug)).toContain("jose");
  });

  it("matches a two-word name typed without the space", () => {
    expect(rankCandidates("shawnporter", PEOPLE).map((c) => c.slug)).toContain("shawn");
  });

  it("is case-insensitive", () => {
    expect(rankCandidates("IMAN", PEOPLE).map((c) => c.slug)).toContain("iman");
  });

  // ZOE is a real participant - it answers and executes board commands.
  it("offers zoe, so the assistant is not the one thing you must memorise", () => {
    expect(rankCandidates("zo", PEOPLE).map((c) => c.slug)).toContain("zoe");
  });

  it("sorts a bot after a person of equal relevance", () => {
    const r = rankCandidates("z", PEOPLE, { limit: 50 });
    expect(r.findIndex((c) => c.slug === "zaal")).toBeLessThan(
      r.findIndex((c) => c.slug === "zoe"),
    );
  });

  it("can exclude bots when a caller wants people only", () => {
    expect(
      rankCandidates("zo", PEOPLE, { includeBots: false }).map((c) => c.slug),
    ).not.toContain("zoe");
  });

  it("returns nothing when nothing matches", () => {
    expect(rankCandidates("qqqq", PEOPLE)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(rankCandidates("", PEOPLE, { limit: 3 })).toHaveLength(3);
  });

  it("carries no roster of its own - an empty roster yields only bots", () => {
    expect(rankCandidates("", [], { limit: 50 }).every((c) => c.isBot)).toBe(true);
  });
});

describe("applyMention - insert the handle", () => {
  it("replaces the partial token and leaves a trailing space", () => {
    const text = "hey @ima";
    const r = applyMention(text, getMentionQuery(text, 8), "iman");
    expect(r.text).toBe("hey @iman ");
    expect(r.caret).toBe(10);
  });

  it("keeps the text that follows the caret", () => {
    const text = "hey @ima can you look";
    const r = applyMention(text, getMentionQuery(text, 8), "iman");
    expect(r.text).toBe("hey @iman  can you look");
  });

  it("works on a bare @", () => {
    const text = "@";
    expect(applyMention(text, getMentionQuery(text, 1), "zoe").text).toBe("@zoe ");
  });

  it("is a no-op when the query is inactive", () => {
    const text = "nothing here";
    expect(applyMention(text, getMentionQuery(text, 5), "iman").text).toBe(text);
  });
});

describe("moveHighlight - keyboard navigation wraps", () => {
  it("moves down and wraps at the end", () => {
    expect(moveHighlight(0, 1, 3)).toBe(1);
    expect(moveHighlight(2, 1, 3)).toBe(0);
  });

  it("moves up and wraps at the start", () => {
    expect(moveHighlight(0, -1, 3)).toBe(2);
  });

  it("survives an empty list", () => {
    expect(moveHighlight(0, 1, 0)).toBe(0);
  });
});

describe("end to end - the interaction that was missing", () => {
  it("type @, see everyone, pick, and the handle lands", () => {
    let text = "looks good ";
    let caret = text.length;

    text += "@";
    caret += 1;
    const opened = getMentionQuery(text, caret);
    expect(opened.active).toBe(true);
    expect(rankCandidates(opened.query, PEOPLE, { limit: 50 }).length).toBeGreaterThan(
      PEOPLE.length - 1,
    );

    text += "im";
    caret += 2;
    const narrowed = getMentionQuery(text, caret);
    const hits = rankCandidates(narrowed.query, PEOPLE);
    expect(hits[0].slug).toBe("iman");

    const done = applyMention(text, narrowed, hits[0].slug);
    expect(done.text).toBe("looks good @iman ");
  });
});
