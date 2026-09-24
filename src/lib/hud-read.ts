// A failed read is not an empty read.
//
// supabase-js does not throw on a failed query: it resolves to
// { data: null, error }. The HUD route used to turn that into [] and answer
// ok:true, so a 402 or a dropped connection rendered "Nothing needs you right
// now." and "none" - the same output as a fleet that is genuinely idle.
// This returns null for "could not read" and [] only for "read, and empty",
// so the page can print UNKNOWN instead of a clean bill of health.

export interface QueryResult<T> {
  data: T[] | null;
  error: unknown;
}

export function rowsOrUnread<T>(res: PromiseSettledResult<QueryResult<T>>): T[] | null {
  if (res.status !== "fulfilled") return null;
  if (res.value.error || !Array.isArray(res.value.data)) return null;
  return res.value.data;
}
