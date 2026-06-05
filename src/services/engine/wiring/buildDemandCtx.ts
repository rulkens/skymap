/**
 * buildDemandCtx — snapshots the read surfaces a demand predicate may
 * consult into a single `DemandCtx` (see `@types/loading/DemandCtx.d.ts` for
 * the rationale behind each surface).
 *
 * ### Why a builder rather than passing `state` to predicates directly
 *
 * Predicates must be cheap to test and impossible to misuse. Handing them the
 * whole `EngineState` would let a predicate reach into unrelated bags (mutate
 * GPU handles, fire callbacks) and would couple every predicate test to the
 * full engine shape. `DemandCtx` is a narrow read-only facade: query
 * functions over the slices a load policy legitimately depends on. The builder
 * is the single place that maps `state` → those queries, so the mapping
 * (drawMask bit, request-flag set, slot-state accessor) lives in one spot.
 *
 * ### Why built once per evaluation cycle, not memoised
 *
 * `reevaluateDemand` calls this once and shares the result across every row.
 * The closures capture `state` by reference, so reads are always live against
 * the current engine state — there's no stale snapshot. Rebuilding per row
 * would allocate fresh closures per row for no benefit.
 */

import { maskHas } from '../../../utils/sourceMask';
import { slotFor } from './slotFor';

import type { DemandCtx } from '../../../@types/loading/DemandCtx';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SourceType } from '../../../@types/data/SourceType';
import type { VolumeFieldId } from '../../../@types/data/VolumeFieldId';
import type { RequestKey } from '../../../@types/loading/RequestKey';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { LoadState } from '../../../@types/loading/LoadState';

export function buildDemandCtx(state: EngineState): DemandCtx {
  return {
    settings: state.settings,
    // Volume params live on the volume store; the closure captures `state`
    // by reference so reads are always live against the current store.
    volumeField: (id: VolumeFieldId) => state.data.volumes.params(id),
    isVisible: (s: SourceType) => maskHas(state.sources.drawMask, s),
    request: (k: RequestKey) => state.requests.has(k),
    // `?? 'idle'` covers the not-yet-minted slot: an absent (null/undefined)
    // slot has never been asked to load, which is exactly what `idle` means.
    slotState: (k: AssetKey): LoadState<unknown>['kind'] =>
      slotFor(state, k)?.state().kind ?? 'idle',
    // A value snapshot is fine: the ctx is rebuilt once per `reevaluateDemand`
    // cycle (synchronous), so it can't go stale within a loop — same liveness
    // guarantee as the closure-based surfaces above.
    flow: { enabled: state.data.flow.enabled },
  };
}
