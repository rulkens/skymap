/**
 * slotFor — resolve an `AssetKey` to its `AssetSlot` across the two homes a slot
 * can live in: a Layer's own `state.layerSlots` (every catalog, texture and
 * overlay slot), else core's mesh body family. One function, so demand
 * predicates and the demand loop never re-derive the branch. A key with no
 * minted slot resolves to `undefined`, which callers treat as "idle / not
 * minted". The payload and request types are erased: callers only consult
 * `state().kind` and `load(req)` generically.
 */

import { isMeshBodyKey } from '../../../utils/meshBodies/isMeshBodyKey';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';

export function slotFor(
  state: Pick<EngineState, 'layerSlots' | 'assetSlots'>,
  key: AssetKey,
): AssetSlot<unknown, unknown> | undefined {
  // A Layer's own slots first: a Layer owns its key outright, and
  // `createLayers` throws on a key core also claims, so this cannot shadow.
  const layerSlot = state.layerSlots.get(key);
  if (layerSlot !== undefined) return layerSlot;
  if (!isMeshBodyKey(key)) return undefined;
  // The Map is keyed by the plain body id; the `mesh:` prefix exists only to
  // keep this `AssetKey` member distinct (see `AssetKey.d.ts`).
  return (state.assetSlots.meshBodies.get(key.slice('mesh:'.length)) ?? undefined) as
    | AssetSlot<unknown, unknown>
    | undefined;
}
