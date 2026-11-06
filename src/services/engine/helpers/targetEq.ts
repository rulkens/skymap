/**
 * targetEq — value-equality on a FocusableTargetBase's IDENTITY fields only, used to
 * dedup slot writes (hover/select/focus setters skip the callback fan-out when
 * the incoming target names the same thing as the slot already holds). Identity,
 * not deep equality: two freshly-resolved GalaxyInfo objects for the same
 * (source, index) compare equal: equal iff their refs key the same.
 */
import { refKey } from '../../../utils/selection/refKey';
import type { FocusableTargetBase } from '../../../@types/engine/selection/FocusableTargetBase';

export function targetEq(a: FocusableTargetBase | null, b: FocusableTargetBase | null): boolean {
  if (a === null || b === null) return a === b;
  return refKey(a.ref) === refKey(b.ref);
}
