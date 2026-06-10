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
 * (survey enabled bit, request-flag set, slot-state accessor) lives in one
 * spot.
 *
 * ### Why built once per evaluation cycle, not memoised
 *
 * `reevaluateDemand` calls this once and shares the result across every row.
 * The closures capture `state` by reference, so reads are always live against
 * the current engine state — there's no stale snapshot. Rebuilding per row
 * would allocate fresh closures per row for no benefit.
 */

import { SOURCE_REGISTRY } from '../../../data/sources';
import { slotFor } from './slotFor';

import type { DemandCtx } from '../../../@types/loading/DemandCtx';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SourceType } from '../../../@types/data/SourceType';
import type { SurveyId } from '../../../@types/engine/data/SurveyId';
import type { RequestKey } from '../../../@types/loading/RequestKey';
import type { AssetKey } from '../../../@types/loading/AssetKey';
import type { LoadState } from '../../../@types/loading/LoadState';

export function buildDemandCtx(state: EngineState): DemandCtx {
  return {
    settings: state.settings,
    // Demand follows intent — the survey's `enabled` bit, the same field
    // `setSourceVisible` writes — uniformly with every other row type
    // (volumes/structures/overlays all gate on their settings `enabled`).
    // NOT the fade-tail drawMask: a just-disabled survey stops demanding
    // immediately while it fades out, and boot demand needs no mask seed.
    // `s` is a SourceType code; the registry maps it to the survey id that
    // keys the items record. A non-survey code's registry id is not a survey
    // id, so the lookup yields undefined — hence `=== true`.
    isVisible: (s: SourceType) =>
      state.settings.surveys.items[SOURCE_REGISTRY[s].id as SurveyId]?.enabled === true,
    request: (k: RequestKey) => state.requests.has(k),
    // `?? 'idle'` covers the not-yet-minted slot: an absent (null/undefined)
    // slot has never been asked to load, which is exactly what `idle` means.
    slotState: (k: AssetKey): LoadState<unknown>['kind'] =>
      slotFor(state, k)?.state().kind ?? 'idle',
  };
}
