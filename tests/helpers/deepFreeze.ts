/**
 * deepFreeze — freeze in place so a stray write THROWS (modules are strict)
 * instead of drifting. Plain objects and arrays only: `Object.freeze` on a
 * non-empty typed array throws. Already-frozen values return early — that
 * terminates cycles and skips what a steady frame shares by identity
 * (`UNSTARTED_EPOCHS`, `EMPTY_SURFACE_MEMORY`, immer-frozen store refs).
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
