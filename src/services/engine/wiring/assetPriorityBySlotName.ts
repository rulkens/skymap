/**
 * assetPriorityBySlotName — project `ASSET_WIRING`'s authored fetch ranks onto
 * the slot NAMES the debug panel renders rows for.
 *
 * The panel's registry (`EngineHandle.assetSlots`) is keyed by `slot.name`
 * (`'glade-points'`, `'starCatalog:gaiaStars'`, …) while the wiring rows are
 * keyed by `AssetKey` (numeric `Source` codes, composite body-texture keys,
 * named sidecar strings). Nothing static relates the two: a slot's name is
 * baked into its factory, so the only honest join runs through
 * `slotFor(state, row.key)` once the slots exist.
 *
 * That is why this takes `EngineState` rather than being a module constant. A
 * hand-written `{ 'glade-points': 62, … }` table would be the same numbers in a
 * second place, free to drift the first time a rank is retuned — the exact
 * duplication the rank table exists to avoid.
 *
 * The returned rank is the AUTHORED one (lower fetches first), not the negated
 * value `reevaluateDemand` hands the queue. The negation is an implementation
 * detail of `popHighestPriority` popping the largest; surfacing it would show
 * the user `-62` for a rank the source calls 62.
 *
 * Slots with no wiring row — the DEV synthetic-volume fixtures — are simply
 * absent from the map, which the panel renders as "unranked".
 */

import { ASSET_WIRING } from './assetWiring';
import { slotFor } from './slotFor';

import type { EngineState } from '../../../@types/engine/state/EngineState';

export function assetPriorityBySlotName(state: EngineState): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const row of ASSET_WIRING) {
    const slot = slotFor(state, row.key);
    if (slot) out.set(slot.name, row.priority);
  }
  return out;
}
