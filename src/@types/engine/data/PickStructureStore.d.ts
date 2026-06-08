import type { StructureRecord } from './StructureRecord';
import type { StructureCategory } from './StructureCategory';

/**
 * Minimal projection of the structure store the pick path reads — just the
 * per-category lookup `pickToSelection` / `resolveStructureFromPick` need. Narrower
 * than the full `StructureStore` so tests stub a one-method object literal.
 */
export type PickStructureStore = {
  byCategory(category: StructureCategory): readonly StructureRecord[];
};
