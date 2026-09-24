import { describe, it, expect, vi, beforeEach } from "vitest";

// Per-table query results the mocked client resolves to. supabase-js resolves
// a failed query to { data: null, error } rather than throwing, so that is the
// shape a 402 or a dropped connection takes here.
const { results } = vi.hoisted(() => ({
  results: {} as Record<string, { data: unknown[] | null; error: unknown } | Error>,
}));

vi.mock("@/lib/auth", () => ({ requireSession: vi.fn(async () => ({ user: "t" })) }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: () => chain,
        limit: () => chain,
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          const r = results[table];
          return r instanceof Error ? reject(r) : resolve(r);
        },
      };
      return chain;
    },
  }),
}));

import { GET } from "./route";

const fresh = new Date().toISOString();
const old = new Date(Date.now() - 37 * 24 * 3600 * 1000).toISOString();

beforeEach(() => {
  process.env.SUPABASE_URL = "http://x";
  process.env.SUPABASE_SERVICE_KEY = "k";
  results.fleet_status = { data: [], error: null };
  results.tasks = { data: [], error: null };
  results.bot_heartbeats = { data: [], error: null };
});

async function body() {
  const res = await GET();
  return res.json();
}

describe("/api/hud: a failed read is not an empty read", () => {
  it("fleet query returning an error reads as unread (null), not as an empty fleet", async () => {
    results.fleet_status = { data: null, error: { message: "HTTP 402" } };
    const j = await body();
    expect(j.fleet).toBeNull();
    expect(j.unread).toContain("fleet_status");
  });

  it("fleet query that rejects reads as unread", async () => {
    results.fleet_status = new Error("socket hang up");
    const j = await body();
    expect(j.fleet).toBeNull();
    expect(j.unread).toContain("fleet_status");
  });

  it("board and harness errors are reported per source", async () => {
    results.tasks = { data: null, error: { message: "boom" } };
    results.bot_heartbeats = { data: null, error: { message: "boom" } };
    const j = await body();
    expect(j.board).toBeNull();
    expect(j.harnesses).toBeNull();
    expect(j.unread).toEqual(["tasks", "bot_heartbeats"]);
    expect(Array.isArray(j.fleet)).toBe(true);
  });

  // Must not over-fire: a genuinely empty table is a real answer.
  it("a real empty result stays [] and nothing is unread", async () => {
    const j = await body();
    expect(j.fleet).toEqual([]);
    expect(j.board).toEqual([]);
    expect(j.harnesses).toEqual([]);
    expect(j.unread).toEqual([]);
  });

  it("a 37-day-old 'working' row is still flagged stale", async () => {
    results.fleet_status = {
      data: [
        { session: "zuke", state: "working", last_line: null, updated_at: old },
        { session: "dotfiles2", state: "working", last_line: null, updated_at: fresh },
      ],
      error: null,
    };
    const j = await body();
    expect(j.fleet.map((r: { session: string; stale: boolean }) => [r.session, r.stale])).toEqual([
      ["zuke", true],
      ["dotfiles2", false],
    ]);
  });
});
