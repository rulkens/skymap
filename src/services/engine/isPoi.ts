import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';

/**
 * isPoi — runtime type predicate for FocusableTarget.
 *
 * Uses `'category' in target` as the discriminant because PointOfInterest
 * declares a top-level `category: PoiCategory` field, while GalaxyInfo
 * carries category information only at the nested `galaxyType.category`
 * path.  `'in'` checks the top-level key only, so a GalaxyInfo never
 * widens into the POI branch by accident.
 *
 * Centralising the discriminant here means every public-handle dispatch
 * and every InfoCard render-branch agree on the same predicate.
 * Changing the discriminant later (e.g. adding an explicit `kind` field)
 * is then a single-file change.
 */
export function isPoi(target: FocusableTarget): target is PointOfInterest {
  return 'category' in target;
}
