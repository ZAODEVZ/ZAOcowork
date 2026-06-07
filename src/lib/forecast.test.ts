import { describe, it, expect } from "vitest";
import { percentile } from "./forecast";

describe("percentile (nearest-rank)", () => {
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100

  it("returns 0 for an empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });
  it("p50 of 1..100 is 50 (nearest-rank, not 51)", () => {
    expect(percentile(sorted, 50)).toBe(50);
  });
  it("p95 is 95", () => {
    expect(percentile(sorted, 95)).toBe(95);
  });
  it("p100 is the max", () => {
    expect(percentile(sorted, 100)).toBe(100);
  });
  it("p0 is the min (clamped, never index -1)", () => {
    expect(percentile(sorted, 0)).toBe(1);
  });
  it("single-element array returns that element at any percentile", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });
});
