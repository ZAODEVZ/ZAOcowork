import type { ActionItem } from "@/lib/types";

export type ResolvedKind = "pr" | "research-doc" | "meeting" | "none";

export interface ResolvedSource {
  kind: ResolvedKind;
  url: string | null;
  label: string;
  refId: string | null;
  needsLiveStatus: boolean;
}

/**
 * Pure function that maps a task's legacy identifiers to its origin.
 * No I/O, no side effects.
 *
 * Resolves patterns:
 * - PR: legacyId /^pr-test-(\d+)$/ or legacySource /^pr-auto:(\d+)$/
 * - Research doc: legacyId /^research-doc-(\d+)$/ or legacySource /^research-doc:(\d+)$/
 * - Meeting: legacyId /^meeting-(.+)$/ or legacySource /^meeting:(.+)$/
 * - None: (default fallback)
 */
export function resolveSource(
  task: Pick<ActionItem, "legacyId" | "legacySource">,
): ResolvedSource {
  const legacyId = task.legacyId ?? "";
  const legacySource = task.legacySource ?? "";

  // PR patterns
  const prTestMatch = legacyId.match(/^pr-test-(\d+)$/);
  const prAutoMatch = legacySource.match(/^pr-auto:(\d+)$/);
  if (prTestMatch || prAutoMatch) {
    const prNumber = prTestMatch ? prTestMatch[1] : prAutoMatch![1];
    return {
      kind: "pr",
      url: `https://github.com/bettercallzaal/ZAOOS/pull/${prNumber}`,
      label: `PR #${prNumber}`,
      refId: prNumber,
      needsLiveStatus: true,
    };
  }

  // Research doc patterns
  const researchDocMatch = legacyId.match(/^research-doc-(\d+)$/);
  const researchAutoMatch = legacySource.match(/^research-doc:(\d+)$/);
  if (researchDocMatch || researchAutoMatch) {
    const docNumber = researchDocMatch ? researchDocMatch[1] : researchAutoMatch![1];
    const encodedPath = encodeURIComponent(`${docNumber}-`);
    return {
      kind: "research-doc",
      url: `https://github.com/search?q=repo%3Abettercallzaal%2FZAOOS+path%3Aresearch+${encodedPath}&type=code`,
      label: `Doc ${docNumber}`,
      refId: docNumber,
      needsLiveStatus: false,
    };
  }

  // Meeting patterns
  const meetingMatch = legacyId.match(/^meeting-(.+)$/);
  const meetingAutoMatch = legacySource.match(/^meeting:(.+)$/);
  if (meetingMatch || meetingAutoMatch) {
    const slug = meetingMatch ? meetingMatch[1] : meetingAutoMatch![1];
    const encodedSlug = encodeURIComponent(slug);
    return {
      kind: "meeting",
      url: `https://github.com/search?q=repo%3Abettercallzaal%2FZAOOS+path%3Aresearch%2Fevents+${encodedSlug}&type=code`,
      label: `Meeting: ${slug}`,
      refId: slug,
      needsLiveStatus: false,
    };
  }

  // Default: no identifiable origin
  return {
    kind: "none",
    url: null,
    label: "",
    refId: null,
    needsLiveStatus: false,
  };
}
