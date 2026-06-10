/**
 * setFilamentIntensity — pure reducer for the filament-skeleton intensity scale.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `filaments` object, every sibling cluster left at its existing reference.
 * That ref-stability is what lets React selectors over untouched clusters skip
 * re-rendering and keeps the engine's per-frame `state.settings` reads cheap —
 * the snapshot only changes shape where a write actually landed. Mutating the
 * input in place would defeat both, hence the spread rather than
 * `state.filaments.intensity = intensity`.
 *
 * `filaments` is a SHARED cluster: this reducer and `setFilamentsEnabled` both
 * write into `state.filaments`, so each spreads the existing object to preserve
 * the sibling leaf it doesn't touch (here, `enabled`).
 *
 * The reducer stores the RAW value — no clamping. The `[0, 1]` clamp lives at
 * the filament renderer's point of use (`clampFilamentIntensity`), so the
 * settings path records user intent unaltered rather than baking a renderer
 * bound into stored state.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setFilamentIntensity(
  state: EngineSettingsState,
  intensity: number,
): EngineSettingsState {
  return { ...state, filaments: { ...state.filaments, intensity } };
}
