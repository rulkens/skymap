import type { StructureInfo } from '../../data/structure/StructureInfo';
import type { StructureCategory } from '../../data/structure/StructureCategory';

/**
 * Minimal projection of the structure store the pick path reads — just the
 * per-category lookup `resolvePick` / `resolveStructureFromPick` need. Narrower
 * than the full `StructureStore` so tests stub a one-method object literal.
 */
export type PickStructureStore = {
  byCategory(category: StructureCategory): readonly StructureInfo[];
};
