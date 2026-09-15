/**
 * Two `AssetWiringRow.req` values that name the same fetch. `req(tier)` allocates a
 * fresh object per call, so identity is never the answer; a FALSE result is a
 * per-frame reload, so a nested object value (compared by identity here) would
 * storm — `assetWiringRequestShape.test.ts` is what keeps every row flat.
 */
export function sameRequest(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || Array.isArray(a)) return false;
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return false;

  const aEntries = Object.entries(a);
  if (aEntries.length !== Object.keys(b).length) return false;
  return aEntries.every(([k, v]) => Object.is(v, (b as Record<string, unknown>)[k]));
}
