/**
 * captureEqual — plain-JSON structural equality, no key-order assumption: a
 * card's `capture` is authored data (numbers, strings, booleans, one Vec3) and
 * never a class instance, so recursing on own keys is exact for this shape.
 */
export function captureEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    captureEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}
