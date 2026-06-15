/**
 * setFilamentsEnabled — pure reducer for the filament-skeleton overlay toggle.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `filaments` object, every sibling cluster left at its existing reference.
 * That ref-stability is what lets React selectors over untouched clusters skip
 * re-rendering and keeps the engine's per-frame `state.settings` reads cheap —
 * the snapshot only changes shape where a write actually landed. Mutating the
 * input in place (`state.filaments.enabled = enabled`) would defeat both, hence
 * the spread.
 *
 * `filaments` is a SHARED cluster: this reducer and `setFilamentIntensity` both
 * write into `state.filaments`, so each spreads the existing object to preserve
 * the sibling leaf it doesn't touch (here, `intensity`).
 *
 * The reducer stores the boolean verbatim. The cosmetic fade ramp that
 * accompanies the toggle in the UI is NOT this reducer's concern — it lives in
 * the handle setter's `fades.fadeTo({ kind: 'filament' })` call, which still
 * fires alongside the action. The render loop reads this flag (plus the live
 * fade opacity) each frame to decide whether the filaments pass stays alive.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setFilamentsEnabled(
  state: EngineSettingsState,
  enabled: boolean,
): EngineSettingsState {
  return { ...state, filaments: { ...state.filaments, enabled } };
}
