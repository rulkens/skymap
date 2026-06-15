import type { StructureInfo } from '../../data/structure/StructureInfo';
import type { StructureId } from '../../data/structure/StructureId';

/**
 * Minimal projection of the structure store the pick path reads — just the
 * per-category lookup `resolvePick` / `resolveStructureFromPick` need. Narrower
 * than the full `StructureStore` so tests stub a one-method object literal.
 */
export type PickStructureStore = {
  byCategory(category: StructureId): readonly StructureInfo[];
};
