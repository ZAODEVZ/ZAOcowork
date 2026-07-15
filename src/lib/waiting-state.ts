import type { ActionItem, Comment } from "./types";
import { extractMentionTokens } from "./mentions";

export type WaitingState =
  | { kind: "none" }
  | { kind: "blocked" }
  | { kind: "waiting-on"; person: string }
  | { kind: "answered" };

/**
 * Compute the waiting state of a task from its comments and status.
 *
 * Logic:
 * - If status is BLOCKED, return "blocked"
 * - If there are no comments or no mentions, return "none"
 * - Walk comments in order, tracking the most recent mention
 * - If the last mention was replied to (next comment is from mentioned person or task owner), return "answered"
 * - If the last mention was NOT replied to, return "waiting-on-<person>"
 */
export function computeWaitingState(item: ActionItem): WaitingState {
  if (item.status === "BLOCKED") {
    return { kind: "blocked" };
  }

  const comments = item.comments || [];
  if (comments.length === 0) {
    return { kind: "none" };
  }

  // Walk comments in chronological order
  let lastMention: { person: string; commentIndex: number } | null = null;

  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];
    const mentions = extractMentionTokens(comment.content);

    if (mentions.length > 0) {
      // Track the most recent mention. If multiple people mentioned, use the first one.
      // In practice, comments usually mention one person.
      lastMention = { person: mentions[0], commentIndex: i };
    } else if (lastMention !== null) {
      // This comment has no mention. Check if it's a reply from the mentioned person
      // or from the task owner (in which case the mention is answered).
      const mentionedPerson = lastMention.person;
      const commentAuthor = (comment.userId || "").toLowerCase();

      if (commentAuthor === mentionedPerson) {
        // The mentioned person replied - mark as answered
        return { kind: "answered" };
      }
    }
  }

  // If we have a last mention and didn't find a reply from that person, it's waiting
  if (lastMention !== null) {
    return { kind: "waiting-on", person: lastMention.person };
  }

  return { kind: "none" };
}

/**
 * Format a waiting state for display.
 */
export function formatWaitingState(state: WaitingState): string | null {
  if (state.kind === "none") return null;
  if (state.kind === "blocked") return "BLOCKED";
  if (state.kind === "answered") return "ANSWERED";
  if (state.kind === "waiting-on") {
    const name = state.person.charAt(0).toUpperCase() + state.person.slice(1);
    return `WAITING ON ${name}`;
  }
  return null;
}

/**
 * Get CSS class for the waiting state badge.
 */
export function getWaitingStateBadgeClass(state: WaitingState): string {
  if (state.kind === "blocked") {
    return "bg-red-500/20 text-red-200 border-red-500/40";
  }
  if (state.kind === "waiting-on") {
    return "bg-amber-500/20 text-amber-200 border-amber-500/40";
  }
  if (state.kind === "answered") {
    return "bg-emerald-500/20 text-emerald-200 border-emerald-500/40";
  }
  return "";
}
