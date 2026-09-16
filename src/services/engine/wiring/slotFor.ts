/**
 * slotFor — resolve an `AssetKey` to its `AssetSlot`, unifying the homes a slot
 * can live in: a Layer's own `state.layerSlots`, else core's own.
 *
 * Core stores its own slots in structurally different places:
 *
 *   - Per-source star-catalog slots live in `state.assetSlots.starCatalogs`,
 *     keyed by the numeric `Source` code.
 *   - The keyed body-texture and mesh-body families live in their own maps.
 *   - The auxiliary assets named by `AssetKey` (the cluster catalog, filaments,
 *     the scalar-volume cubes) are named fields on `state.assetSlots`.
 *   - A Layer's own slots live in `state.layerSlots`, consulted first.
 *
 * `AssetKey` is the union of the key spaces — a numeric `SourceType` OR one of
 * the string keys. A single `slotFor(state, key)` lets demand predicates and
 * the demand loop ask "what's the slot for this key?" without every caller
 * re-deriving the branch. Single-sourcing it here keeps the mapping in one
 * place rather than duplicated at each call site.
 *
 * A numeric key that is not a star catalog resolves to `undefined` here: its
 * slot, if any, is a Layer's and was already returned above. Slots covered by
 * no home resolve to `undefined` too, which callers treat as "idle / not
 * minted".
 *
 * Returns `AssetSlot<unknown, unknown> | undefined`: the slot's payload and
 * request types are erased because callers here only consult `state().kind`
 * and `load(req)` generically. The single named-field branch carries a union
 * of slot types, which TS widens to the erased shape on return.
 */

import { SOURCE_REGISTRY } from '../../../data/sources';
import { isBodyTextureKey } from '../../../utils/scene/isBodyTextureKey';
import { isMeshBodyKey } from '../../../utils/scene/isMeshBodyKey';
import { isCoreSlotFieldKey } from '../../../utils/loading/isCoreSlotFieldKey';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';

export function slotFor(
  state: EngineState,
  key: AssetKey,
): AssetSlot<unknown, unknown> | undefined {
  // A Layer's own slots first: a Layer owns its key outright, and
  // `createLayers` throws on a key core also claims, so this cannot shadow.
  const layerSlot = state.layerSlots.get(key);
  if (layerSlot !== undefined) return layerSlot;
  // Numeric = Source code. Only star catalogs have a core per-source map; a
  // galaxy source's slot is its Layer's and was returned above.
  if (typeof key === 'number') {
    const slot =
      SOURCE_REGISTRY[key].type === 'starCatalog'
        ? state.assetSlots.starCatalogs.get(key)
        : undefined;
    return (slot ?? undefined) as AssetSlot<unknown, unknown> | undefined;
  }
  // A body-texture family key routes through the keyed `bodyTextures` Map (the
  // fourth slot home, alongside points / starCatalogs / named sidecar fields).
  // The guard narrows `key` so the else-branch below can index the named
  // sidecar fields without a cast.
  if (isBodyTextureKey(key)) {
    return (state.assetSlots.bodyTextures.get(key) ?? undefined) as
      | AssetSlot<unknown, unknown>
      | undefined;
  }
  // A mesh-body key routes through the keyed `meshBodies` Map, un-prefixed —
  // the Map itself is keyed by the plain body id, the `mesh:` prefix exists
  // only to keep this branch's `AssetKey` member distinct (see `AssetKey.d.ts`).
  if (isMeshBodyKey(key)) {
    return (state.assetSlots.meshBodies.get(key.slice('mesh:'.length)) ?? undefined) as
      | AssetSlot<unknown, unknown>
      | undefined;
  }
  // A string key with no named field is a Layer's (returned above) or unminted.
  if (!isCoreSlotFieldKey(state.assetSlots, key)) return undefined;
  return (state.assetSlots[key] ?? undefined) as AssetSlot<unknown, unknown> | undefined;
}
