/**
 * setFlow — pure reducer for a partial patch into the CF4++ flow-overlay
 * settings slice (`settings.flow`).
 *
 * Flow's user-facing state is a single `FlowSettings` object — the master
 * `enabled` gate plus the look/motion knobs — rather than a per-item Record.
 * A patch merges leaf-by-leaf: `{ ...state.flow, ...patch }` writes the present
 * leaves and preserves every untouched one. The whole-slice patch mirrors the
 * `handle.flow.set(patch)` shape, so a knob change is one patch end-to-end.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `flow` object, every sibling cluster left at its existing reference. That
 * ref-stability lets React selectors over untouched clusters skip re-rendering
 * and keeps the engine's per-frame `state.settings` reads cheap.
 *
 * The reducer stores the raw patch verbatim — NO clamps. The GPU-safe bounds
 * (`MAX_PARTICLES` particle-buffer ceiling, `MIN_TRAIL_STEP` compute-loop floor)
 * live in `clampFlowParams` at the flow renderer, the single point of use, so a
 * runaway slider or devtools call is bounded where it could actually overrun a
 * buffer — not duplicated here.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { FlowSettings } from '../../../../@types/settings/FlowSettings';

export function setFlow(
  state: EngineSettingsState,
  patch: Partial<FlowSettings>,
): EngineSettingsState {
  return { ...state, flow: { ...state.flow, ...patch } };
}
