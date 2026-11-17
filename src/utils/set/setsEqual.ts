/**
 * setsEqual — true when two sets hold the same members, whatever their identity.
 * For per-frame change detection on a freshly built set, where `===` always
 * misses and serialising to a string would allocate every frame.
 */

export function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
