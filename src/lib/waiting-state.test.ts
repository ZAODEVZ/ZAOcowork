import { describe, it, expect } from "vitest";
import { computeWaitingState, formatWaitingState } from "./waiting-state";
import type { ActionItem, Comment } from "./types";

describe("waiting-state", () => {
  const baseItem: ActionItem = {
    id: "1",
    title: "Test task",
    status: "WIP",
    owner: "Zaal",
    createdBy: "zaal",
    category: "Other",
    priority: "P2",
    important: false,
    urgent: false,
    completedAt: "",
    completedBy: "",
    phase: "Define",
    due: "",
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    brands: [],
  };

  it("returns 'none' when there are no comments", () => {
    const item: ActionItem = { ...baseItem, comments: [] };
    const state = computeWaitingState(item);
    expect(state.kind).toBe("none");
  });

  it("returns 'blocked' when status is BLOCKED", () => {
    const item: ActionItem = {
      ...baseItem,
      status: "BLOCKED",
      comments: [
        {
          id: "1",
          userId: "zaal",
          displayName: "Zaal",
          content: "Hey @iman can you review?",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const state = computeWaitingState(item);
    expect(state.kind).toBe("blocked");
  });

  it("returns 'none' when there are no mentions", () => {
    const item: ActionItem = {
      ...baseItem,
      comments: [
        {
          id: "1",
          userId: "zaal",
          displayName: "Zaal",
          content: "This is a normal comment with no mentions",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const state = computeWaitingState(item);
    expect(state.kind).toBe("none");
  });

  it("returns 'waiting-on-<person>' when there is an unanswered mention", () => {
    const item: ActionItem = {
      ...baseItem,
      comments: [
        {
          id: "1",
          userId: "zaal",
          displayName: "Zaal",
          content: "Hey @iman can you review this?",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const state = computeWaitingState(item);
    expect(state.kind).toBe("waiting-on");
    expect(state.kind === "waiting-on" && state.person).toBe("iman");
    expect(formatWaitingState(state)).toBe("WAITING ON Iman");
  });

  it("returns 'answered' when the mentioned person replies", () => {
    const item: ActionItem = {
      ...baseItem,
      comments: [
        {
          id: "1",
          userId: "zaal",
          displayName: "Zaal",
          content: "Hey @iman can you review this?",
          createdAt: new Date().toISOString(),
        },
        {
          id: "2",
          userId: "iman",
          displayName: "Iman",
          content: "Sure, I reviewed it. LGTM!",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const state = computeWaitingState(item);
    expect(state.kind).toBe("answered");
    expect(formatWaitingState(state)).toBe("ANSWERED");
  });

  it("tracks the most recent mention", () => {
    const item: ActionItem = {
      ...baseItem,
      comments: [
        {
          id: "1",
          userId: "zaal",
          displayName: "Zaal",
          content: "Hey @iman can you review?",
          createdAt: new Date().toISOString(),
        },
        {
          id: "2",
          userId: "samantha",
          displayName: "Samantha",
          content: "Samantha here, just a comment",
          createdAt: new Date().toISOString(),
        },
        {
          id: "3",
          userId: "zaal",
          displayName: "Zaal",
          content: "Actually, @thyrev can you look at this instead?",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const state = computeWaitingState(item);
    expect(state.kind).toBe("waiting-on");
    expect(state.kind === "waiting-on" && state.person).toBe("thyrev");
  });

  it("returns 'none' when all mentions are answered", () => {
    const item: ActionItem = {
      ...baseItem,
      comments: [
        {
          id: "1",
          userId: "zaal",
          displayName: "Zaal",
          content: "Hey @iman can you review?",
          createdAt: new Date().toISOString(),
        },
        {
          id: "2",
          userId: "iman",
          displayName: "Iman",
          content: "Done! But I need @samantha to check the styling",
          createdAt: new Date().toISOString(),
        },
        {
          id: "3",
          userId: "samantha",
          displayName: "Samantha",
          content: "Looks good to me!",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const state = computeWaitingState(item);
    expect(state.kind).toBe("answered");
  });
});
