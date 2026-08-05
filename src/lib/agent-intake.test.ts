import { describe, expect, it } from "vitest";
import {
  checkAgentIntake,
  bestMatchScore,
  sharedIdentifiers,
  extractIdentifiers,
  AGENT_DUPLICATE_THRESHOLD,
  MIN_AGENT_NOTE_CHARS,
} from "./agent-intake";
import { AGENT_SOURCES, isAgentSource, TASK_SOURCES } from "./types";

// Fixtures are REAL titles taken off the live board on 2026-08-04, not
// invented ones. The whole point of the gate is that the escalator's output
// looks plausible - synthetic gibberish fixtures would not exercise it.
const REAL_ESCALATOR_TITLES = [
  "Process PR #244: artist rider tracker",
  "Process PR #244 for volunteer coordination",
  "Check open PRs for ZAOstock app",
  "Implement Zoostr leaderboard & tokenomics",
  "Build Zoostr leaderboard API route",
  "Advance BetterCallZaal brand with content and PR",
];

const existing = REAL_ESCALATOR_TITLES.map((title, i) => ({ id: String(1000 + i), title }));

const goodNotes =
  "Source: https://github.com/bettercallzaal/ZAOOS/pull/244. Done when the rider tracker merges.";

describe("isAgentSource", () => {
  it("treats escalated / ai-proposal / external-api as agent writes", () => {
    expect(isAgentSource("escalated")).toBe(true);
    expect(isAgentSource("ai-proposal")).toBe(true);
    expect(isAgentSource("external-api")).toBe(true);
  });

  it("does NOT treat a human at the web box or Telegram as an agent", () => {
    // This is the load-bearing negative. If human-web ever counted as an
    // agent source, the QuickAdd form would start returning 422 to Zaal.
    expect(isAgentSource("human-web")).toBe(false);
    expect(isAgentSource("human-bot")).toBe(false);
    expect(isAgentSource(null)).toBe(false);
    expect(isAgentSource(undefined)).toBe(false);
  });

  it("every AGENT_SOURCES value is a real TaskSource", () => {
    for (const s of AGENT_SOURCES) expect(TASK_SOURCES).toContain(s);
  });
});

describe("checkAgentIntake - human sources are untouched", () => {
  it("lets a human write a one-word task with no body", () => {
    // task-quality.ts's rule stands for humans: a thin task beats a lost one.
    expect(
      checkAgentIntake({ title: "ZAOstock", notes: "", source: "human-web" }, existing),
    ).toBeNull();
  });

  it("lets a human write an exact duplicate of an existing title", () => {
    expect(
      checkAgentIntake(
        { title: "Check open PRs for ZAOstock app", notes: "", source: "human-bot" },
        existing,
      ),
    ).toBeNull();
  });
});

describe("checkAgentIntake - undefined agent writes are refused", () => {
  it("refuses an agent task with no body at all", () => {
    // 93 of 93 open escalator rows looked exactly like this.
    const r = checkAgentIntake(
      { title: "Advance BetterCallZaal brand with content and PR", notes: "", source: "escalated" },
      [],
    );
    expect(r?.code).toBe("undefined-task");
  });

  it("refuses a body that is too short to carry a source link and a done-condition", () => {
    const r = checkAgentIntake({ title: "Do the thing", notes: "later", source: "escalated" }, []);
    expect(r?.code).toBe("undefined-task");
  });

  it("counts whitespace-only notes as empty rather than as a body", () => {
    const r = checkAgentIntake(
      { title: "Do the thing", notes: "   \n\t  ".padEnd(80), source: "escalated" },
      [],
    );
    expect(r?.code).toBe("undefined-task");
  });

  it("accepts a body carrying a source link and a done-condition", () => {
    expect(
      checkAgentIntake({ title: "Something genuinely new here", notes: goodNotes, source: "escalated" }, []),
    ).toBeNull();
  });

  it("reports the actual length so the caller can see how far short it fell", () => {
    const r = checkAgentIntake({ title: "x", notes: "abc", source: "escalated" }, []);
    expect(r?.message).toContain("Got 3");
  });
});

describe("checkAgentIntake - near-duplicates are refused", () => {
  it("catches the real #244 pair that exact-match dedup misses", () => {
    // These two are both live on the board. They are NOT string-equal - there
    // are 0 exact-duplicate titles among all 94 escalator rows - so an
    // equality check reports a clean board and this pair survives forever.
    const r = checkAgentIntake(
      {
        title: "Process PR #244 for volunteer coordination",
        notes: goodNotes,
        source: "escalated",
      },
      [{ id: "1000", title: "Process PR #244: artist rider tracker" }],
    );
    expect(r?.code).toBe("duplicate");
    expect(r?.relatedIds).toContain("1000");
  });

  it("does NOT collapse the two Zoostr tasks, which are genuinely different work", () => {
    // "Implement Zoostr leaderboard & tokenomics" vs "Build Zoostr
    // leaderboard API route" share the leaderboard noun but are a product
    // task and a route task. Over-merging real work is the failure mode that
    // made an earlier automated dedup pass useless.
    const r = checkAgentIntake(
      { title: "Build Zoostr leaderboard API route", notes: goodNotes, source: "escalated" },
      [{ id: "1003", title: "Implement Zoostr leaderboard & tokenomics" }],
    );
    expect(r).toBeNull();
  });

  it("checks definition BEFORE duplication", () => {
    // A task that is both undefined and duplicated should report the thing
    // the caller can actually fix first. Reporting "duplicate" for a row with
    // no body sends the agent to dedup its way out of a definition problem.
    const r = checkAgentIntake(
      { title: "Process PR #244 for volunteer coordination", notes: "", source: "escalated" },
      [{ id: "1000", title: "Process PR #244: artist rider tracker" }],
    );
    expect(r?.code).toBe("undefined-task");
  });

  it("allows genuinely new agent work through", () => {
    expect(
      checkAgentIntake(
        { title: "Wire the Telegram digest to the new relay hub", notes: goodNotes, source: "escalated" },
        existing,
      ),
    ).toBeNull();
  });
});

describe("threshold calibration", () => {
  it("uses a lower bar than the human path", () => {
    // 0.7 (task-quality's default) catches 8 of the 93 real rows; 0.5
    // catches 35. The asymmetry is intentional - see agent-intake.ts.
    expect(AGENT_DUPLICATE_THRESHOLD).toBeLessThan(0.7);
  });

  it("word-overlap alone does NOT catch the real #244 pair - this is why identifiers exist", () => {
    // Measured: 0.375. Documenting it as a test so nobody 'fixes' the
    // threshold down to 0.35 to catch it and silently starts merging the
    // Zoostr pair (0.286) as well - a 0.06 window is not a safe margin.
    const score = bestMatchScore("Process PR #244 for volunteer coordination", [
      { id: "1000", title: "Process PR #244: artist rider tracker" },
    ]);
    expect(score).toBeLessThan(AGENT_DUPLICATE_THRESHOLD);
    expect(score).toBeCloseTo(0.375, 3);
  });

  it("the identifier check is what catches it", () => {
    expect(
      sharedIdentifiers(
        "Process PR #244 for volunteer coordination",
        "Process PR #244: artist rider tracker",
      ),
    ).toEqual(["ref:244"]);
  });

  it("does not treat different PR numbers as the same reference", () => {
    expect(sharedIdentifiers("Process PR #244", "Process PR #245")).toEqual([]);
  });

  it("keeps the Zoostr pair below the word-overlap threshold", () => {
    const score = bestMatchScore("Build Zoostr leaderboard API route", [
      { id: "1003", title: "Implement Zoostr leaderboard & tokenomics" },
    ]);
    expect(score).toBeLessThan(AGENT_DUPLICATE_THRESHOLD);
  });

  it("scores an unrelated title near zero", () => {
    expect(
      bestMatchScore("Wire the Telegram digest to the new relay hub", existing),
    ).toBeLessThan(AGENT_DUPLICATE_THRESHOLD);
  });

  it("requires a body long enough for a URL plus a short sentence", () => {
    expect(MIN_AGENT_NOTE_CHARS).toBeGreaterThanOrEqual(40);
  });
});
