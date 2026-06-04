/**
 * resolvePoiFromPick — map a structure pick hit `(category, poiIndex)` back
 * to its `StructureRecord` by indexing into the structure store's
 * per-category table.
 *
 * ### Contract (inherited from the cluster-viz plan-3 pick path)
 *
 * `clusterMarkerRenderer.pickRing` issues one instanced draw per
 * category (cluster / supercluster / void) with `firstInstance` set to
 * that category's bucket offset; the fragment packs
 * `@builtin(instance_index) - bucketOffset` worth of slot info into the
 * pick texture as `poiIndex`.  `unpackPick` already returns the
 * per-category-local 0-based index (see `selectionEncoding.ts` and the
 * dispatch comment in `clusterMarkerRenderer.pickRing`), so the array
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
 * `byCategory(cat)` entry regardless of fade, so `byCategory(cat)[poiIndex]`
 * resolves the pick hit's structure correctly.
 *
 * ### Why structures only
 *
 * Rings are a structure-only affordance (cluster / supercluster / void);
 * famous galaxies are picked through the point path, never the ring path.
 * A `famousGalaxy` category therefore can't arrive here from a ring pick —
 * the guard returns null defensively rather than indexing a store that
 * doesn't hold famous galaxies (and narrows `category` to a
 * `StructureCategory` for the `byCategory` lookup).
 *
 * ### Why a narrowed `structures` param rather than the full `EngineState`
 *
 * The helper only needs `byCategory`.  Narrowing the param shape (a
 * one-method object type — `StoreForPickResolve` below) keeps the test stubs
 * trivial (no need to construct a full `EngineState` to assert a pure lookup)
 * and avoids coupling this module to the full `StructureStore` import.
 */

import type { StructureRecord } from '../../../@types/engine/data/StructureRecord';
import type { StructureCategory } from '../../../@types/engine/data/StructureCategory';
import type { PoiCategory } from '../subsystems/poiSubsystem';

export type PickPoiInput = {
  readonly category: PoiCategory;
  readonly poiIndex: number;
};

// Minimal projection of the structure store the helper uses.  Narrower than
// the full `StructureStore` so tests can stub with a one-method object
// literal — see `tests/services/engine/helpers/resolvePoiFromPick.test.ts`.
type StoreForPickResolve = {
  byCategory(category: StructureCategory): readonly StructureRecord[];
};

export function resolvePoiFromPick(
  structures: StoreForPickResolve,
  input: PickPoiInput,
): StructureRecord | null {
  // Rings are structure-only; a famousGalaxy hit can't come from the ring
  // pick path. The check also narrows `category` to `StructureCategory`.
  if (input.category === 'famousGalaxy') return null;
  const records = structures.byCategory(input.category);
  return records[input.poiIndex] ?? null;
}
