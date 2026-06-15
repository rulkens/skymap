/**
 * targetEq — value-equality on a FocusableTarget's IDENTITY fields only.
 *
 * Used to dedup slot writes: hover/select/focus setters skip the
 * callback fan-out when the incoming target names the same thing as
 * the slot already holds.  Identity, not deep equality — two GalaxyInfo
 * objects for the same (source, index) compare equal even though their
 * derived display fields are freshly recomputed each pick, and a
 * StructureInfo compares on its stable `id` regardless of the rest of
 * the record.
 *
 * Dispatch is a narrowing on the union tag (`type`): after the null
 * guards and an equal-tag check, narrowing `a` on `type` also pins
 * `b`'s shape (we re-test `b.type` in the same condition so the
 * compiler narrows it without a cast).
 */

import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';

export function targetEq(a: FocusableTarget | null, b: FocusableTarget | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'galaxyCatalog' && b.type === 'galaxyCatalog') {
    return a.source === b.source && a.index === b.index;
  }
  if (a.type === 'structure' && b.type === 'structure') {
    return a.id === b.id;
  }
  if (a.type === 'milkyWay' && b.type === 'milkyWay') {
    // The Milky Way is a singleton — two milkyWay targets always name the same
    // thing.  Compare on the tag (not reference) so dedup holds by contract.
    return true;
  }
  return false;
}
