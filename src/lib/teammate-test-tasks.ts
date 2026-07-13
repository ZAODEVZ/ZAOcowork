// Teammate test-task system: auto-create teaching tasks when PRs merge.
// Zaal's job: daily tasks + test what we build. Teammates learn while testing.
// Per-teammate config defines starting level (L1=guided, L2=goal+why, L3=own-it)
// and area preferences for task routing.

export type TestLevel = "L1" | "L2" | "L3";

export interface TeammateConfig {
  name: string;
  startLevel: TestLevel;
  areas: string[]; // e.g. ["frontend", "ui", "qa"] — route to this teammate if PR touches these
}

export type TeammateKey = "jose" | "iman";

// Config: Jose (earlier in journey) starts at L1, Iman (more advanced) at L2.
// Area preferences route PRs intelligently; simple round-robin is fallback.
export const TEAMMATE_CONFIG: Record<TeammateKey, TeammateConfig> = {
  jose: {
    name: "Jose",
    startLevel: "L1",
    areas: ["frontend", "ui", "qoa", "components", "design"],
  },
  iman: {
    name: "Iman",
    startLevel: "L2",
    areas: ["backend", "supabase", "database", "db", "api", "routes"],
  },
};

/**
 * Generate an intermediate-level test plan based on the teammate's starting level.
 * L1: more hand-holding (how + why), L2: goal+why (they figure out the how).
 */
export function generateTestPlan(
  prTitle: string,
  prUrl: string,
  prNumber: number,
  changeDescription: string,
  level: TestLevel,
): string {
  const shippedLine = `Shipped via PR #${prNumber}: ${prTitle}`;
  const linkLine = `PR link: ${prUrl}`;

  if (level === "L1") {
    // L1 (Jose): more explicit guidance
    return `Test: ${shippedLine}

${linkLine}

** What shipped **
${changeDescription}

** Why it matters **
Zaal is testing teammates by having you verify the work. This teaches you the flow: PR -> build -> manual test -> verify expected behavior matches the implementation.

** What to verify **
1. App builds + boots cleanly (no errors in console)
2. The feature/fix from the PR description works as described
3. No UI breaks or unexpected side effects
4. Expected result: the change does what the PR says

** How to test **
- Check the PR body for testing steps (look for "Testing" or "How to test" section)
- If no steps given, use the change description above to figure out what to try
- Test on mobile AND desktop if the change touches UI
- Screenshot or describe anything that looks broken

** Next level**
L1 = we give you the what + the why, you figure out the steps. You're learning the app + build flow. Next: L2 = we give you goal + why, you own the steps + report back. Then L3 = you own the whole plan.

Reach out if the PR is unclear or you get stuck — that's the point.`;
  } else if (level === "L2") {
    // L2 (Iman): goal + why, they own the how
    return `Test: ${shippedLine}

${linkLine}

** What shipped **
${changeDescription}

** Why it matters **
${prTitle.toLowerCase().includes("fix") ? "Fixes a bug or deficiency; verify the fix actually works." : "New feature or enhancement; verify it behaves as intended."}

** What to verify **
The change does what the PR says. Build is green, no console errors, no side effects.

** How to test **
You know the flow. Check the PR body for hints if you need them, or reason from the description above.

** Next level**
L2 = goal + why, you own the steps. You're growing from guided testing to independent testing. Next level: write the test plan yourself + review PRs before they merge.`;
  } else {
    // L3 (future): own it all
    return `Test: ${shippedLine}

${linkLine}

${changeDescription}

Verify + report back.`;
  }
}

/**
 * Route a PR to a teammate based on area preference (if detectable) or round-robin.
 * Returns the TeammateKey (jose | iman).
 */
export function routeToTeammate(
  repoName: string,
  prTitle: string,
  filesChanged?: string[],
): TeammateKey {
  const allText = `${repoName} ${prTitle} ${filesChanged?.join(" ") || ""}`.toLowerCase();

  // Check if PR touches Iman's areas (backend, database, etc.)
  const imanAreas = TEAMMATE_CONFIG.iman.areas;
  if (imanAreas.some((area) => allText.includes(area))) {
    return "iman";
  }

  // Check if PR touches Jose's areas (frontend, UI, etc.)
  const joseAreas = TEAMMATE_CONFIG.jose.areas;
  if (joseAreas.some((area) => allText.includes(area))) {
    return "jose";
  }

  // No strong signal — simple round-robin fallback based on time
  // (alternates every day roughly, deterministic per PR).
  const hour = Math.floor(Date.now() / (1000 * 60 * 60));
  return hour % 2 === 0 ? "jose" : "iman";
}

/**
 * Build an idempotent legacy_source for a test task auto-created from a PR merge.
 * Format: "test:pr-<repo>-<number>"
 * Used to detect + skip duplicate task creation if the webhook retries.
 */
export function buildTestTaskLegacySource(repoName: string, prNumber: number): string {
  return `test:pr-${repoName}-${prNumber}`;
}

/**
 * Check if a task has already been created for this PR merge.
 * Tasks are tagged with legacySource="test:pr-<repo>-<num>".
 */
export function isTestTaskAlreadyCreated(
  allTasks: Array<{ legacySource?: string }>,
  repoName: string,
  prNumber: number,
): boolean {
  const legacySource = buildTestTaskLegacySource(repoName, prNumber);
  return allTasks.some((t) => t.legacySource === legacySource);
}
