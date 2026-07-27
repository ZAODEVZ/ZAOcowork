"use client";

// useTeamPeople - live team roster for every people picker in the UI.
//
// One fetch of /api/team, shared shape, hardcoded fallback until it lands. This
// was previously inlined in TaskRoom only; every other picker used the
// hardcoded OWNERS union and was therefore missing 7 of the 14 active members.
//
// The response is cached at module scope so a board rendering several pickers
// (filter bar, bulk-action bar, triage panel) issues one request, not one per
// component.

import { useEffect, useState } from "react";
import { fallbackTeamOptions, type TeamOption } from "@/lib/team-options";

let cache: TeamOption[] | null = null;
let inflight: Promise<TeamOption[]> | null = null;

async function fetchTeam(): Promise<TeamOption[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/api/team")
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { people?: TeamOption[] } | null) => {
      const people = d?.people;
      if (people && people.length > 0) {
        cache = people;
        return people;
      }
      // Empty or malformed response: fall back rather than blanking every
      // dropdown in the app.
      return fallbackTeamOptions();
    })
    .catch(() => fallbackTeamOptions())
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Clear the module cache (after a roster change in /admin). */
export function invalidateTeamOptions(): void {
  cache = null;
}

/**
 * The active roster as { slug, name }. Returns the hardcoded fallback on first
 * render so a picker is never momentarily empty, then swaps to the live list.
 */
export function useTeamPeople(): TeamOption[] {
  const [people, setPeople] = useState<TeamOption[]>(() => cache ?? fallbackTeamOptions());

  useEffect(() => {
    let cancelled = false;
    fetchTeam().then((list) => {
      if (!cancelled) setPeople(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return people;
}
