/**
 * setHighlightFallback — pure reducer for the orientation-fallback highlight
 * debug toggle (which galaxy catalogs lack a measured position angle).
 *
 * Copy-on-write at the `galaxyCatalogs` cluster only (new top-level + new `galaxyCatalogs`
 * ref, siblings untouched) — the shared settings-reducer contract. The boolean
 * stores verbatim; the renderer reads `state.settings.galaxyCatalogs.highlightFallback`
 * each frame.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setHighlightFallback(
  state: EngineSettingsState,
  highlightFallback: boolean,
): EngineSettingsState {
  return { ...state, galaxyCatalogs: { ...state.galaxyCatalogs, highlightFallback } };
}
