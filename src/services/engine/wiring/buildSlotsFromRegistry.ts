/**
 * buildSlotsFromRegistry — the construction pass over `ASSET_WIRING`.
 *
 * Walks the wiring registry and calls each row's `factory(deps)`, collecting
 * the returned slots into a `Map<AssetKey, AssetSlot>`. This is the pure half
 * of the build → install → load pipeline: it allocates and subscribes slots
 * but writes nothing to `state.assetSlots` and never calls `slot.load()`.
 * `installSlots` owns the single mutation site; `reevaluateDemand` owns load.
 *
 * ### Why two kinds of row are skipped
 *
 * `built: 'external'` rows (the keyed `bodyTextures` / `meshBodies` families)
 * are minted directly in `wireSlots`; their rows exist only so the demand loop
 * can trigger the already-minted slots, and their `factory` is a throwing guard.
 *
 * A LAYER's rows are skipped for the same reason with a different owner:
 * `createLayers` already called each one's factory into `state.layerSlots`.
 * Building them again here would hand back the same slot and give it a SECOND
 * home in `state.assetSlots` — one `slotFor` never reaches, and no disjointness
 * assert can see.
 */

import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { SlotDeps } from '../../../@types/loading/SlotDeps';

export function buildSlotsFromRegistry(
  rows: readonly AssetWiringRow[],
  deps: SlotDeps,
): Map<AssetKey, AssetSlot<unknown, unknown>> {
  const slots = new Map<AssetKey, AssetSlot<unknown, unknown>>();
  for (const row of rows) {
    if (row.built === 'external') continue;
    if (deps.state.layerSlots.has(row.key)) continue;
    slots.set(row.key, row.factory(deps) as AssetSlot<unknown, unknown>);
  }
  return slots;
}
