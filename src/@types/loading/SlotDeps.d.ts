/**
 * SlotDeps — the single dependency bag every slot factory receives.
 *
 * ### Why a single bag instead of per-field DI
 *
 * Each slot factory needs access to `EngineState` (to write its slot onto
 * `state.assetSlots`, read GPU handles in the commit callback, etc.) and
 * `EngineCallbacks` (to fire engine EVENTS like `sources.onCatalogReady` from
 * inside commit). Splitting them into individual parameters `(state, cb, device, ...)` as
 * more dependencies accumulate would force every factory signature to
 * change in lockstep. A single bag keeps every factory shape identical
 * and lets `wireSlots` call `factory(deps)` uniformly without branching
 * on which extras each factory needs.
 *
 * The SlotFactory docstring records this choice explicitly: "alternatives —
 * like a single mega-context object — would obscure exactly which fields each
 * factory touches." SlotDeps takes that position one step further for the
 * wiring-registry context: all factories already touch both `state` and `cb`,
 * so the bag has no obscuring effect — it just names the pair.
 *
 * The slot factories themselves keep the narrow `(state, cb)` signature; each
 * `AssetWiringRow.factory` adapts the bag with `(deps) => createX(deps.state,
 * deps.cb)`, so `buildSlotsFromRegistry` can call every row uniformly as
 * `row.factory(deps)`.
 */

import type { EngineState } from '../engine/state/EngineState';
import type { EngineCallbacks } from '../engine/EngineCallbacks';

export type SlotDeps = {
  state: EngineState;
  cb: EngineCallbacks;
};
