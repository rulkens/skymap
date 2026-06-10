/**
 * SlotFactory — the contract every per-asset slot factory satisfies.
 *
 * Each factory is a pure builder:
 *
 *   1. constructs the `AssetSlot` via `createAssetSlot`,
 *   2. wires `slot.subscribe` for any side effects (logs, store writes,
 *      callbacks).  Render-on-demand wakes are NOT a factory concern —
 *      they are handled generically by the wiring layer's
 *      `installSlotReadyWake`.
 *   3. RETURNS the slot.
 *
 * It does NOT write `state.assetSlots.<name>` and does NOT call
 * `slot.load(...)`. Both belong to the orchestrator: `installSlots` is the
 * single mutation site that writes each returned slot onto state, and
 * `reevaluateDemand` owns when a slot actually loads. Splitting construction
 * from install + load keeps a factory independently testable without a full
 * engine context, and routes every install through one auditable seam.
 *
 * The factory does NOT write to `allSlots` either — the flat registry is
 * a per-call concern (rebuilt every bootstrap) and lives in the orchestrator.
 *
 * Factory parameters are intentionally narrow.  Factories that need
 * additional dependencies take them via extra parameters past the
 * canonical `(state, cb)` prefix; the uniform prefix keeps the call
 * sites in `wireSlots` shaped the same way (alternatives — like a
 * single mega-context object — would obscure exactly which fields each
 * factory touches, hurting reviewability).
 */

import type { AssetSlot } from './AssetSlot';
import type { EngineState } from '../engine/state/EngineState';
import type { EngineCallbacks } from '../engine/EngineCallbacks';

export type SlotFactory<TPayload, TRequest> = (
  state: EngineState,
  cb: EngineCallbacks,
) => AssetSlot<TPayload, TRequest>;
