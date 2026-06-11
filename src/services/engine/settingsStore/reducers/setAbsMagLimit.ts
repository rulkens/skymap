/**
 * setAbsMagLimit — pure reducer for the volume-limited absolute-magnitude cut.
 *
 * Copy-on-write at the `bias` cluster only (new top-level + new `bias` ref,
 * siblings untouched) — the shared settings-reducer contract. Mutating the
 * input in place (`state.bias.absMagLimit = absMagLimit`) would defeat the
 * ref-stability that lets React selectors over untouched clusters skip
 * re-rendering, hence the spread.
 *
 * The reducer stores the number verbatim — the bias bake reads the value off
 * `state.settings.bias.absMagLimit` when the mode requires it; no clamp or
 * derived companion lives here.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setAbsMagLimit(
  state: EngineSettingsState,
  absMagLimit: number,
): EngineSettingsState {
  return { ...state, bias: { ...state.bias, absMagLimit } };
}
