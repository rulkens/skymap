/**
 * setShowPickBuffer — pure reducer for the pick-buffer debug-overlay toggle.
 *
 * Copy-on-write at the touched `debug` cluster only: a new top-level state and
 * a new `debug` object, every sibling cluster left at its existing reference.
 * That ref-stability is what lets React selectors over untouched clusters skip
 * re-rendering and keeps the engine's per-frame `state.settings` reads cheap —
 * the snapshot only changes shape where a write actually landed. Mutating the
 * input in place (`state.debug.showPickBuffer = show`) would defeat both, hence
 * the spread.
 *
 * The reducer stores the boolean verbatim. The `debug` cluster carries two
 * independent leaves (`showPickBuffer`, `showDiskRadiusRing`); spreading
 * `...state.debug` preserves the sibling leaf so flipping one diagnostic lens
 * doesn't clobber the other.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setShowPickBuffer(state: EngineSettingsState, show: boolean): EngineSettingsState {
  return { ...state, debug: { ...state.debug, showPickBuffer: show } };
}
