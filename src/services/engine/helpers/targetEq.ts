/**
 * targetEq — value-equality on a FocusableTarget's IDENTITY fields only, used to
 * dedup slot writes (hover/select/focus setters skip the callback fan-out when
 * the incoming target names the same thing as the slot already holds). Identity,
 * not deep equality: two freshly-resolved GalaxyInfo objects for the same
 * (source, index) compare equal: equal iff their refs key the same.
 */
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';
import { refKey } from '../../../utils/selection/refKey';

export function targetEq(a: FocusableTarget | null, b: FocusableTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return refKey(a.ref) === refKey(b.ref);
}
