import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';

/**
 * A ref's identity as one string: two refs name the same thing iff their keys match. Fields
 * are sorted by name so a ref built in another field order keys the same; refs hold flat
 * primitives only, so `String` is lossless.
 */
export function refKey(ref: SelectionRefBase): string {
  const fields = Object.entries(ref)
    .filter(([name]) => name !== 'type')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, value]) => String(value));
  return [ref.type, ...fields].join(':');
}
