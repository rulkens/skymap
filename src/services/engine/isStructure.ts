import type { StructureRecord } from '../../@types/data/structure/StructureRecord';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';

/**
 * isStructure — runtime type predicate for FocusableTarget.
 *
 * Uses `'category' in target` as the discriminant because StructureRecord
 * declares a top-level `category: StructureCategory` field, while GalaxyInfo
 * carries category information only at the nested `galaxyType.category`
 * path.  `'in'` checks the top-level key only, so a GalaxyInfo never
 * widens into the structure branch by accident.
 *
 * Centralising the discriminant here means every public-handle dispatch
 * and every InfoCard render-branch agree on the same predicate.
 * Changing the discriminant later (e.g. adding an explicit `kind` field)
 * is then a single-file change.
 */
export function isStructure(target: FocusableTarget): target is StructureRecord {
  return 'category' in target;
}
