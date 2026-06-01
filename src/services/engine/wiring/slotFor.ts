/**
 * slotFor — resolve an `AssetKey` to its `AssetSlot`, unifying the two homes
 * a slot can live in.
 *
 * The engine stores slots in two structurally different places:
 *
 *   - Per-source point slots live in a `Map<SourceType, AssetSlot>`
 *     (`state.assetSlots.points`), keyed by the numeric `Source` code.
 *   - The auxiliary assets named by `AssetKey` (the cluster catalog,
 *     famous-meta, the PGC-alias map) are named fields on `state.assetSlots`.
 *
 * `AssetKey` is the union of both key spaces — a numeric `SourceType` OR one
 * of the string keys. A single `slotFor(state, key)` lets demand predicates
 * and the demand loop ask "what's the slot for this key?" without every caller
 * re-deriving the numeric-vs-string branch. Single-sourcing it here keeps the
 * two-home mapping in one place rather than duplicated at each call site.
 *
 * The `typeof key === 'number'` guard is the discriminant: numeric keys are
 * `SourceType` (point slots), everything else is a string `AssetKey`. The
 * string branch indexes `assetSlots` by the key directly — slots not covered
 * by a named field (e.g. a string key with no corresponding slot) resolve to
 * `undefined`, which callers treat as "idle / not minted".
 *
 * Returns `AssetSlot<unknown, unknown> | undefined`: the slot's payload and
 * request types are erased because callers here only consult `state().kind`
 * and `load(req)` generically. The single named-field branch carries a union
 * of slot types, which TS widens to the erased shape on return.
 */

import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';

export function slotFor(
  state: EngineState,
  key: AssetKey,
): AssetSlot<unknown, unknown> | undefined {
  const slot =
    typeof key === 'number' ? state.assetSlots.points.get(key) : state.assetSlots[key];
  return (slot ?? undefined) as AssetSlot<unknown, unknown> | undefined;
}
