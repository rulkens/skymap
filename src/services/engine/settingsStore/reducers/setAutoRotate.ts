/**
 * setAutoRotate — pure reducer for the camera auto-rotate toggle.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `camera` object, every sibling cluster left at its existing reference. That
 * ref-stability is what lets React selectors over untouched clusters skip
 * re-rendering and keeps the engine's per-frame `state.settings` reads cheap —
 * the snapshot only changes shape where a write actually landed. Mutating the
 * input in place (`state.camera.autoRotate = autoRotate`) would defeat both,
 * hence the spread.
 *
 * The reducer stores the boolean verbatim — auto-rotate has no clamp or
 * derived companion; it is a plain on/off flag the render loop reads each
 * frame.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setAutoRotate(
  state: EngineSettingsState,
  autoRotate: boolean,
): EngineSettingsState {
  return { ...state, camera: { ...state.camera, autoRotate } };
}
