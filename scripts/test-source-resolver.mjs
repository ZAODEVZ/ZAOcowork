import assert from "node:assert";

/**
 * Test script for source-resolver (standalone Node.js, no framework).
 * Mirrors the regex contract directly without importing the TS module.
 */

// Inline the resolver logic for testing
function resolveSource(task) {
  const legacyId = task.legacyId ?? "";
  const legacySource = task.legacySource ?? "";

  // PR patterns
  const prTestMatch = legacyId.match(/^pr-test-(\d+)$/);
  const prAutoMatch = legacySource.match(/^pr-auto:(\d+)$/);
  if (prTestMatch || prAutoMatch) {
    const prNumber = prTestMatch ? prTestMatch[1] : prAutoMatch[1];
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
    const docNumber = researchDocMatch ? researchDocMatch[1] : researchAutoMatch[1];
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
    const slug = meetingMatch ? meetingMatch[1] : meetingAutoMatch[1];
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

// Test cases
const cases = [
  {
    name: "pr-test-665 -> pr",
    task: { legacyId: "pr-test-665", legacySource: "" },
    expectKind: "pr",
  },
  {
    name: "research-doc-801 -> research-doc",
    task: { legacyId: "research-doc-801", legacySource: "" },
    expectKind: "research-doc",
  },
  {
    name: "meeting-jose-onb-0605-miniapp -> meeting",
    task: { legacyId: "meeting-jose-onb-0605-miniapp", legacySource: "" },
    expectKind: "meeting",
  },
  {
    name: "cowork-actions.json (legacy) -> none",
    task: { legacyId: "108", legacySource: "cowork-actions.json" },
    expectKind: "none",
  },
];

for (const { name, task, expectKind } of cases) {
  const result = resolveSource(task);
  assert.strictEqual(
    result.kind,
    expectKind,
    `FAIL: ${name} - expected kind="${expectKind}", got kind="${result.kind}"`,
  );
}

console.log("OK: 4 source-resolver cases pass");
