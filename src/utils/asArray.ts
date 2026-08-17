/**
 * asArray — normalise a `value | value[] | null | undefined` into a single
 * readonly array so callers can iterate uniformly. `null`/`undefined` collapse
 * to the empty array (nothing to do); a lone value is wrapped; an array passes
 * through. `watchKeyboardEventsSaga` uses it to fold a shortcut's
 * `Action | Action[] | null` `run` result into one `for..of` of `put`s.
 */
export function asArray<T>(value: T | readonly T[] | null | undefined): readonly T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value as T];
}
