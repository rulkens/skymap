/**
 * deepFreeze — freeze in place so a stray write THROWS (modules are strict).
 * Plain objects and arrays only: `Object.freeze` on a non-empty typed array
 * throws. The already-frozen early return is what terminates cycles.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  const proto: unknown = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
