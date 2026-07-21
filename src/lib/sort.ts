// Stable comparator for task ids that may be numeric strings ("1240") or UUIDs.
//
// The old `(Number(a.id) || 0) - (Number(b.id) || 0)` collapsed every UUID to 0
// (Number("<uuid>") is NaN, `|| 0` -> 0), so any board mixing numeric legacy ids
// and UUIDs sorted the UUID rows in arbitrary, unstable order. This comparator
// sorts numeric ids numerically, keeps them ahead of UUIDs, and orders UUIDs
// lexicographically so the result is deterministic.
export function compareIds(a: string | number, b: string | number): number {
  const sa = String(a);
  const sb = String(b);
  const na = Number(sa);
  const nb = Number(sb);
  const aNum = sa.trim() !== "" && Number.isFinite(na);
  const bNum = sb.trim() !== "" && Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return sa.localeCompare(sb);
}
