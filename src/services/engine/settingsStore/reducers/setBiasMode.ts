/**
 * setBiasMode — pure reducer for the Malmquist-bias correction mode.
 *
 * Copy-on-write at the `bias` cluster only (new top-level + new `bias` ref,
 * siblings untouched) — the shared settings-reducer contract. Mutating the
 * input in place (`state.bias.mode = mode`) would defeat the ref-stability that
 * lets React selectors over untouched clusters skip re-rendering, hence the
 * spread.
 *
 * The reducer stores the integer mode verbatim — re-baking the bias-correction
 * worker is a SEPARATE event-driven action that the engine's bespoke
 * `setBiasMode` still performs alongside dispatching this write; it is not a
 * derived companion of the stored value, so it has no place in the pure
 * reducer.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { BiasMode } from '../../../../@types/data/BiasMode';

export function setBiasMode(state: EngineSettingsState, mode: BiasMode): EngineSettingsState {
  return { ...state, bias: { ...state.bias, mode } };
}
