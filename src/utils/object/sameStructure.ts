/**
 * Whether two plain-data values are structurally equal: primitives by `===`,
 * arrays element-wise, objects by own keys. Compares whatever
 * fields exist, so a type that grows a field is compared without a per-field list.
 */
export function sameStructure(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) =>
      sameStructure((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  );
}
