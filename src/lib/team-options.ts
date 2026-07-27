// team-options.ts - the single source of truth for "who can own a task" in the UI.
//
// Audit finding (2026-07-26): the owner dropdowns were driven by the hardcoded
// `OWNERS` union in types.ts, which lists 9 names. `team_members` holds 14
// active people. The seven who are not in the union - Aziz, Dcoop, JANGO,
// Metamu, Nemesis, Ohnahji, Vishnu - could not be selected in the board's owner
// filter, the bulk-assign bar, the triage panel, or admin bulk ops. Dcoop is an
// admin with open tasks and was unreachable from every people picker.
//
// Assignment itself was never broken: effectiveAssignees()/isAssignedTo() in
// types.ts lowercase both sides, so my-work, digests and mentions always
// resolved correctly. The gap was purely the *option lists*.
//
// `/api/team` already returns the live roster as { slug, name } (and TaskRoom
// already consumed it). This module makes that the shared path for every people
// picker instead of one component's private fetch.

import type { Owner } from "@/lib/types";
import { OWNERS } from "@/lib/types";

export interface TeamOption {
  /** Lowercase login slug - matches team_members.legacy_owner, case-normalized. */
  slug: string;
  /** Display name as stored in team_members.name. */
  name: string;
}

/**
 * Pseudo-owners that are not people. They stay hardcoded because they are board
 * semantics, not roster entries: "Open" means unassigned, "Both" is lossy
 * legacy data that effectiveAssignees() deliberately resolves to nobody.
 */
export const PSEUDO_OWNERS: Owner[] = ["Both", "Open"];

function isPseudo(value: string): boolean {
  const v = value.trim().toLowerCase();
  return PSEUDO_OWNERS.some((p) => p.toLowerCase() === v);
}

/**
 * The fallback roster, used only until the /api/team fetch resolves. Derived
 * from the legacy hardcoded union so first paint is never an empty dropdown.
 */
export function fallbackTeamOptions(): TeamOption[] {
  return OWNERS.filter((o) => !isPseudo(o)).map((o) => ({
    slug: o.toLowerCase(),
    name: o,
  }));
}

/**
 * Normalize an owner value (raw `legacy_owner`, a slug, or a display name) to
 * its canonical lowercase slug.
 *
 * `legacy_owner` casing is inconsistent in the DB - "Zaal"/"Iman"/"ThyRev" are
 * capitalized while "aziz"/"dcoop"/"jose" are lowercase - so nothing may
 * compare owner strings with `===` without going through here first.
 */
export function ownerSlug(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Display label for an owner value. Falls back to the raw value when the person
 * is not in the roster (deactivated members still own historical tasks, and
 * their name should not vanish from a card).
 */
export function ownerLabel(value: unknown, options: TeamOption[]): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Open";
  const slug = ownerSlug(raw);
  const match = options.find((o) => o.slug === slug);
  if (match) return match.name;
  const pseudo = PSEUDO_OWNERS.find((p) => p.toLowerCase() === slug);
  if (pseudo) return pseudo;
  return raw;
}

/**
 * Merge the live roster with any owner values already present on tasks, so a
 * deactivated or renamed member who still owns open work remains selectable in
 * a filter. Without this, filtering to "whoever owns this stale task" becomes
 * impossible the moment they are deactivated.
 *
 * Returns roster members first (alphabetical, as /api/team sorts them), then
 * any extras, then the pseudo-owners last.
 */
export function mergeOwnerOptions(
  roster: TeamOption[],
  ownersInUse: Iterable<string> = [],
): TeamOption[] {
  const bySlug = new Map<string, TeamOption>();
  for (const o of roster) {
    const slug = ownerSlug(o.slug);
    if (slug) bySlug.set(slug, { slug, name: o.name });
  }
  for (const raw of ownersInUse) {
    const slug = ownerSlug(raw);
    if (!slug || isPseudo(slug) || bySlug.has(slug)) continue;
    // Unknown owner still on a task: show the raw value so it stays filterable.
    bySlug.set(slug, { slug, name: String(raw).trim() });
  }
  return [...bySlug.values()];
}
