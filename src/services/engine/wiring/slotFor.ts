/**
 * slotFor — resolve an `AssetKey` to its `AssetSlot`, unifying the three homes
 * a slot can live in.
 *
 * The engine stores slots in three structurally different places:
 *
 *   - Per-source galaxy point slots live in a `Map<SourceType, AssetSlot>`
 *     (`state.assetSlots.points`), keyed by the numeric `Source` code.
 *   - Per-source star-catalog slots live in the parallel
 *     `state.assetSlots.starCatalogs` map — same numeric key space, different
 *     payload/request types (see `EngineAssetSlots` for why two maps).
 *   - The auxiliary assets named by `AssetKey` (the cluster catalog,
 *     famous-galaxies-meta, the PGC-alias map, filaments, the scalar-volume cubes) are
 *     named fields on `state.assetSlots`.
 *
 * `AssetKey` is the union of the key spaces — a numeric `SourceType` OR one of
 * the string keys. A single `slotFor(state, key)` lets demand predicates and
 * the demand loop ask "what's the slot for this key?" without every caller
 * re-deriving the branch. Single-sourcing it here keeps the mapping in one
 * place rather than duplicated at each call site.
 *
 * `typeof key === 'number'` splits numeric `Source` codes from string keys —
 * but WHICH per-source map a numeric key resolves through is dispatched on the
 * registry entry's kind (`SOURCE_REGISTRY[key].type`), not assumed. The
 * earlier "numeric ⇒ points map" shortcut baked the galaxy assumption into the
 * resolution path: a registry-built star slot installed elsewhere resolved to
 * `undefined` and the demand loop silently never loaded it. Entry-type
 * dispatch keeps resolution symmetric with `installSlots`' routing — the two
 * seams read the same discriminant, so they can't disagree about where a
 * source kind's slot lives. Slots not covered by any home (a string key with
 * no corresponding field) resolve to `undefined`, which callers treat as
 * "idle / not minted".
 *
 * Returns `AssetSlot<unknown, unknown> | undefined`: the slot's payload and
 * request types are erased because callers here only consult `state().kind`
 * and `load(req)` generically. The single named-field branch carries a union
 * of slot types, which TS widens to the erased shape on return.
 */

import { SOURCE_REGISTRY } from '../../../data/sources';
import { isBodyTextureKey } from '../../../utils/scene/isBodyTextureKey';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';

export function slotFor(
  state: EngineState,
  key: AssetKey,
): AssetSlot<unknown, unknown> | undefined {
  // Numeric = Source code; dispatch on the registry entry's kind (star vs
  // galaxy) for which per-source map holds the slot.
  if (typeof key === 'number') {
    const slot =
      SOURCE_REGISTRY[key].type === 'starCatalog'
        ? state.assetSlots.starCatalogs.get(key)
        : state.assetSlots.points.get(key);
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
  return (state.assetSlots[key] ?? undefined) as AssetSlot<unknown, unknown> | undefined;
}
