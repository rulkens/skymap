/**
 * buildSlotsFromRegistry — the construction pass over `ASSET_WIRING`.
 *
 * Walks the wiring registry and calls each row's `factory(deps)`, collecting
 * the returned slots into a `Map<AssetKey, AssetSlot>`. This is the pure half
 * of the build → install → load pipeline: it allocates and subscribes slots
 * but writes nothing to `state.assetSlots` and never calls `slot.load()`.
 * `installSlots` owns the single mutation site; `reevaluateDemand` owns load.
 *
 * ### Why `built: 'external'` rows are skipped
 *
 * The seven point slots (6 galaxy catalogs + Synthetic) are minted directly in
 * `wireSlots` by `wireGalaxyCatalogSourceSlot`, alongside the keyed
 * `bodyTextures` family — they self-install into `state.assetSlots.points`
 * before this construction pass runs. Building them here would double-register
 * their commit subscriber and fade handle. Their rows exist only so the demand
 * loop can trigger the already-minted slots; their `factory` is a throwing
 * guard. Skipping the `'external'` marker keeps construction and demand on one
 * table without the builder ever touching that guard.
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
    slots.set(row.key, row.factory(deps) as AssetSlot<unknown, unknown>);
  }
  return slots;
}
