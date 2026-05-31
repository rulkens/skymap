/**
 * resolvePoiFromPick — map a POI pick hit `(category, poiIndex)` back
 * to its `PointOfInterest` record by indexing into the POI subsystem's
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
 * `subsystem.getPoisForCategory(cat)` is the canonical lookup.
 *
 * ### Why the array lookup is safe
 *
 * `produceMarkers` iterates `pois` in stored array order and emits
 * EXACTLY ONE descriptor per marker-bearing POI of a visible category
 * — including ones faded fully out, which emit at alpha 0 and are
 * discarded in-fragment (visible passes + ring pick) rather than being
 * omitted.  `setMarkers` then re-groups by category preserving within-
 * group order.  Because no faded POI is dropped, the i-th descriptor of
 * a category is the i-th `getPoisForCategory(cat)` entry regardless of
 * fade, so `getPoisForCategory(cat)[poiIndex]` resolves the pick hit's
 * structure correctly.  The contract holds as long as every POI of a
 * marker-bearing category sets a radius (so it emits a marker at all) —
 * see `getPoisForCategory`'s docstring in `PoiSubsystem.d.ts`.
 *
 * ### Why this lives in a shared helper now
 *
 * Pre-extraction the lookup was inlined inside `wireInput.ts`'s
 * `createClickResolver` call site.  The hover throttler in
 * `runFrame.ts` needs the same lookup (cluster-viz plan 5, task 4),
 * and duplicating the lookup (and the contract docstring) at the
 * second call site was strictly worse than promoting both to a one-
 * line module.  Both call sites now route through this helper, which
 * guarantees the click and hover paths agree byte-for-byte on the
 * `(category, poiIndex) → POI` mapping.
 *
 * ### Why a narrowed `subsystem` param rather than the full `EngineState`
 *
 * The helper only needs `getPoisForCategory`.  Narrowing the param
 * shape (a one-method object type — `SubsystemForPickResolve` below)
 * keeps the test stubs trivial (no need to construct a full
 * `EngineState` to assert a pure lookup) and avoids coupling this
 * module to the full `PoiSubsystem` import.  If a future refactor
 * splits the subsystem into hover/selection slices, this helper only
 * needs whichever slice still owns `getPoisForCategory`.
 */

import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import type { PoiCategory } from '../subsystems/poiSubsystem';

export type PickPoiInput = {
  readonly category: PoiCategory;
  readonly poiIndex: number;
};

// Minimal projection of the POI subsystem the helper uses.  Narrower
// than the full `PoiSubsystem` so tests can stub with a one-method
// object literal — see `tests/services/engine/helpers/resolvePoiFromPick.test.ts`.
type SubsystemForPickResolve = {
  getPoisForCategory(category: PoiCategory): readonly PointOfInterest[];
};

export function resolvePoiFromPick(
  subsystem: SubsystemForPickResolve,
  input: PickPoiInput,
): PointOfInterest | null {
  const pois = subsystem.getPoisForCategory(input.category);
  return pois[input.poiIndex] ?? null;
}
