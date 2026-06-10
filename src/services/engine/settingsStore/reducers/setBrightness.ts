/**
 * setBrightness — pure reducer for the shared survey billboard brightness.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `surveys` object, every sibling cluster left at its existing reference. That
 * ref-stability is what lets React selectors over untouched clusters skip
 * re-rendering and keeps the engine's per-frame `state.settings` reads cheap —
 * the snapshot only changes shape where a write actually landed. Mutating the
 * input in place would defeat both, hence the spread rather than
 * `state.surveys.brightness = brightness`.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setBrightness(state: EngineSettingsState, brightness: number): EngineSettingsState {
  return { ...state, surveys: { ...state.surveys, brightness } };
}
