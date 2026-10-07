/**
 * Whether two plain-data values are structurally equal: primitives by `===`,
 * arrays and typed arrays element-wise, objects by own keys. Compares whatever
 * fields exist, so a type that grows a field is compared without a per-field list.
 */
export function sameStructure(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.constructor !== b.constructor) {
      return false;
    }
    const x = a as unknown as ArrayLike<number>;
    const y = b as unknown as ArrayLike<number>;
    return x.length === y.length && Array.prototype.every.call(x, (v, i) => v === y[i]);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) =>
      sameStructure((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  );
}
