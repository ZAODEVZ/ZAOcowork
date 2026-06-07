import { describe, it, expect } from "vitest";
import { extractMentionTokens, matchMentions } from "./mentions";

describe("extractMentionTokens", () => {
  it("extracts a simple mention", () => {
    expect(extractMentionTokens("hey @zaal look at this")).toEqual(["zaal"]);
  });
  it("does NOT match email addresses", () => {
    expect(extractMentionTokens("mail me at bob@iman.com")).toEqual([]);
  });
  it("lowercases and de-duplicates", () => {
    expect(extractMentionTokens("@Zaal @ZAAL @iman")).toEqual(["zaal", "iman"]);
  });
  it("requires at least 2 characters", () => {
    expect(extractMentionTokens("@a hi")).toEqual([]);
  });
  it("matches a mention at the start of the string", () => {
    expect(extractMentionTokens("@iman please start")).toEqual(["iman"]);
  });
});

describe("matchMentions", () => {
  const candidates = [
    { key: "u1", aliases: ["Zaal", "zaal", null] },
    { key: "u2", aliases: ["Thy Rev", "thyrev", "thy_handle"] },
  ];
  it("matches by login id", () => {
    expect(matchMentions("ping @zaal", candidates)).toEqual(["u1"]);
  });
  it("matches a spaced display name collapsed to one token", () => {
    expect(matchMentions("hey @thyrev", candidates)).toEqual(["u2"]);
  });
  it("returns [] when there are no mentions", () => {
    expect(matchMentions("no mentions here", candidates)).toEqual([]);
  });
  it("matches multiple distinct candidates", () => {
    expect(matchMentions("@zaal and @thy_handle", candidates).sort()).toEqual(["u1", "u2"]);
  });
  it("ignores a mention that matches no candidate", () => {
    expect(matchMentions("@nobody here", candidates)).toEqual([]);
  });
});
