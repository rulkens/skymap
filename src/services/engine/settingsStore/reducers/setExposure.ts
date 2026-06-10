/**
 * setExposure — pure reducer for the HDR tone-map exposure multiplier.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `tonemap` object, every sibling cluster left at its existing reference. That
 * ref-stability is what lets React selectors over untouched clusters skip
 * re-rendering and keeps the engine's per-frame `state.settings` reads cheap —
 * the snapshot only changes shape where a write actually landed. Mutating the
 * input in place would defeat both, hence the spread rather than
 * `state.tonemap.exposure = exposure`.
 *
 * The reducer stores the raw value verbatim — no clamp. Exposure's HDR-safe
 * `[0.05, 16]` range lives at the post-process pass (`clampExposure`), the one
 * place a wild deep-link / devtools value gets bounded. Clamping here too would
 * split that responsibility across two homes and let the stored value disagree
 * with the value the slider thumb reflects.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setExposure(state: EngineSettingsState, exposure: number): EngineSettingsState {
  return { ...state, tonemap: { ...state.tonemap, exposure } };
}
