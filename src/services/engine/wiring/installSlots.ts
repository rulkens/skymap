/**
 * installSlots — the single mutation site for registry-built slots.
 *
 * `buildSlotsFromRegistry` returns slots without touching `state`; this
 * function is the one place that writes them onto `state.assetSlots`. Routing
 * every install through one seam (rather than each factory self-installing)
 * means the construction pass stays pure and testable, and "which slot landed
 * where" is auditable in a single function instead of scattered across the
 * factories.
 *
 * Two key spaces, three destinations:
 *
 *   - **String keys** are the sidecar assets. Every sidecar `AssetKey` is a
 *     named field on `EngineAssetSlots` whose string spelling matches the key
 *     exactly, so the write is a direct `state.assetSlots[key] = slot`.
 *   - **Numeric keys** are `Source` codes, and which per-source map a slot
 *     belongs to is a property of the REGISTRY ENTRY'S KIND, not of
 *     numericness: star-catalog rows (`type: 'starCatalog'`) are
 *     registry-built and install into the `starCatalogs` map here; galaxy
 *     point rows are `built: 'external'` (minted + self-installed into
 *     `points` in `wireSlots`) and never reach this map, so skipping them is a
 *     defensive no-op.
 *
 * The alternative — the earlier "numeric ⇒ point source ⇒ skip" guard — baked
 * the galaxy assumption into the seam: any future registry-built per-source
 * kind would be silently dropped between build and install (the star slots
 * were the first casualty). Discriminating on `SOURCE_REGISTRY[key].type`
 * keeps galaxy behaviour identical while giving each new source kind an
 * explicit destination or an explicit skip.
 */

import { SOURCE_REGISTRY } from '../../../data/sources';
import { isBodyTextureKey } from '../../../utils/scene/isBodyTextureKey';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';

export function installSlots(
  state: EngineState,
  slots: ReadonlyMap<AssetKey, AssetSlot<unknown, unknown>>,
): void {
  for (const [key, slot] of slots) {
    if (typeof key === 'number') {
      // Numeric = Source code; dispatch on the registry entry's kind (see the
      // module docstring for why not "numeric ⇒ galaxy ⇒ skip").
      if (SOURCE_REGISTRY[key].type === 'starCatalog') {
        // The erased slot is the star factory's return; the map write
        // re-asserts the payload/request pair that factory produced.
        state.assetSlots.starCatalogs.set(
          key,
          slot as unknown as AssetSlot<StarCatalog, StarCatalogReq>,
        );
      }
      // Galaxy point sources self-install into `points` in wireSlots — never here.
      continue;
    }
    // Body-texture family keys are `built: 'external'` (minted in wireSlots into
    // the keyed `bodyTextures` map), so the construction pass never hands them
    // here — the guard is a defensive skip that also narrows `key` off the
    // family members so the named-field index below typechecks.
    if (isBodyTextureKey(key)) continue;
    state.assetSlots[key] = slot as never;
  }
}
