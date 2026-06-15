/**
 * resolveStructureFromPick — map a structure pick hit `(category, structureIndex)` back
 * to its `StructureInfo` by indexing into the structure store's
 * per-category table.
 *
 * ### Contract (inherited from the cluster-viz plan-3 pick path)
 *
 * `structureMarkerRenderer.pickRing` issues one instanced draw per
 * category (cluster / supercluster / void) with `firstInstance` set to
 * that category's bucket offset; the fragment packs
 * `@builtin(instance_index) - bucketOffset` worth of slot info into the
 * pick texture as `structureIndex`.  `unpackPick` already returns the
 * per-category-local 0-based index (see `selectionEncoding.ts` and the
 * dispatch comment in `structureMarkerRenderer.pickRing`), so the array
 * `structures.byCategory(cat)` is the canonical lookup.
 *
 * ### Why the array lookup is safe
 *
 * `produceStructureMarkers` iterates `structures.all()` in stored array
 * order and emits EXACTLY ONE descriptor per marker-bearing structure of a
 * visible category — including ones faded fully out, which emit at alpha 0
 * and are discarded in-fragment rather than being omitted.  `setMarkers`
 * then re-groups by category preserving within-group order.  Because no
 * faded structure is dropped, the i-th descriptor of a category is the i-th
 * `byCategory(cat)` entry regardless of fade, so `byCategory(cat)[structureIndex]`
 * resolves the pick hit's structure correctly.
 *
 * ### Why structures only
 *
 * Rings are a structure-only affordance (cluster / supercluster / void);
 * famous galaxies are picked through the point path, never the ring path.
 * The input `category` is therefore typed `StructureCategory` — a famous
 * category can't reach this lookup by construction.
 *
 * ### Why a narrowed `structures` param rather than the full `EngineState`
 *
 * The helper only needs `byCategory`.  The narrowed param shape
 * (`PickStructureStore`) keeps the test stubs trivial (no need to construct a
 * full `EngineState` to assert a pure lookup) and avoids coupling this module
 * to the full `StructureStore` import.
 */

import type { StructureInfo } from '../../../@types/data/structure/StructureInfo';
import type { StructureCategory } from '../../../@types/data/structure/StructureCategory';
import type { PickStructureStore } from '../../../@types/engine/data/PickStructureStore';

export type PickStructureInput = {
  readonly category: StructureCategory;
  readonly structureIndex: number;
};

export function resolveStructureFromPick(
  structures: PickStructureStore,
  input: PickStructureInput,
): StructureInfo | null {
  const records = structures.byCategory(input.category);
  return records[input.structureIndex] ?? null;
}
