/**
 * SlotFactory — the contract every per-asset slot factory satisfies.
 *
 * H4 (2026-05-11 audit) split the wireSlots phase from a 614-line god
 * function into one small factory per sidecar slot kind.  Each factory:
 *
 *   1. constructs the `AssetSlot` via `createAssetSlot`,
 *   2. wires `slot.subscribe` for any side effects (logs, callbacks,
 *      render-on-demand wakes),
 *   3. writes the slot to `state.assetSlots.<name>` so engine code that
 *      reads from state finds it,
 *   4. returns the slot so the caller can register it on a downstream
 *      aggregate (e.g. `allSlots` for the loading-progress emitter).
 *
 * The factory does NOT call `slot.load(...)` — load ordering belongs to
 * the wireSlots orchestrator, which kicks the survey loads, awaits the
 * all-arrivals gate, and (when appropriate) drives the synthetic
 * fallback.
 *
 * The factory does NOT write to `allSlots` either — the flat registry is
 * a per-call concern (rebuilt every bootstrap) and lives in wireSlots.
 *
 * Factory parameters are intentionally narrow.  Factories that need
 * additional dependencies take them via extra parameters past the
 * canonical `(state, cb)` prefix; the uniform prefix keeps the call
 * sites in `wireSlots` shaped the same way (alternatives — like a
 * single mega-context object — would obscure exactly which fields each
 * factory touches, hurting reviewability).
 */

import type { AssetSlot } from '../types';
import type { EngineState, EngineCallbacks } from '../../../@types';

export type SlotFactory<TPayload, TRequest> = (
  state: EngineState,
  cb: EngineCallbacks,
) => AssetSlot<TPayload, TRequest>;
