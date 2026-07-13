import { describe, it, expect } from "vitest";
import { renderTemplate } from "./apply-facts.mjs";

describe("renderTemplate", () => {
  const facts = { WEEK_COUNT: "100+", OG_HOLDER_COUNT: "122" };

  it("substitutes a single known token", () => {
    const { rendered } = renderTemplate("Live for {{WEEK_COUNT}} unbroken weeks.", facts);
    expect(rendered).toBe("Live for 100+ unbroken weeks.");
  });

  it("substitutes multiple distinct tokens in one pass", () => {
    const { rendered } = renderTemplate(
      "{{WEEK_COUNT}} weeks, {{OG_HOLDER_COUNT}} holders.",
      facts
    );
    expect(rendered).toBe("100+ weeks, 122 holders.");
  });

  it("substitutes the same token repeated multiple times", () => {
    const { rendered } = renderTemplate("{{WEEK_COUNT}} and {{WEEK_COUNT}} again.", facts);
    expect(rendered).toBe("100+ and 100+ again.");
  });

  it("leaves content with no tokens untouched", () => {
    const { rendered, usedTokens } = renderTemplate("No tokens here.", facts);
    expect(rendered).toBe("No tokens here.");
    expect(usedTokens.size).toBe(0);
  });

  it("reports which tokens were used", () => {
    const { usedTokens } = renderTemplate("{{WEEK_COUNT}} weeks", facts);
    expect(usedTokens.has("WEEK_COUNT")).toBe(true);
    expect(usedTokens.has("OG_HOLDER_COUNT")).toBe(false);
  });

  it("throws on an unknown token instead of silently leaving it in place", () => {
    expect(() => renderTemplate("{{NOT_A_REAL_FACT}}", facts, { sourceLabel: "test.html" })).toThrow(
      /NOT_A_REAL_FACT/
    );
  });

  it("includes the source label in the error for an unknown token", () => {
    expect(() => renderTemplate("{{NOT_A_REAL_FACT}}", facts, { sourceLabel: "templates/paper.html" })).toThrow(
      /templates\/paper\.html/
    );
  });
});
