/**
 * setHighlightFallback — pure reducer for the orientation-fallback highlight
 * debug toggle (which surveys lack a measured position angle).
 *
 * Copy-on-write at the `surveys` cluster only (new top-level + new `surveys`
 * ref, siblings untouched) — the shared settings-reducer contract. The boolean
 * stores verbatim; the renderer reads `state.settings.surveys.highlightFallback`
 * each frame.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setHighlightFallback(
  state: EngineSettingsState,
  highlightFallback: boolean,
): EngineSettingsState {
  return { ...state, surveys: { ...state.surveys, highlightFallback } };
}
