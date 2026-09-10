/**
 * deepFreeze — freeze in place so a stray write THROWS (modules are strict)
 * rather than drifting invisibly. Plain objects and arrays only: `Object.freeze`
 * on a non-empty typed array throws, and a class instance is not this guard's
 * business. Already-frozen values return early, which terminates cycles and
 * spares the shared `ORIENTATION_FRAMES` bases a re-walk every frame.
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
