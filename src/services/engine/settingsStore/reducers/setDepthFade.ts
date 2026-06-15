/**
 * setDepthFade — pure reducer for the galaxy catalog depth-fade toggle.
 *
 * Copy-on-write at the `galaxyCatalogs` cluster only (new top-level + new `galaxyCatalogs`
 * ref, siblings untouched), the same structural-sharing contract every
 * settings reducer keeps. The boolean rides in verbatim — no clamp, no derived
 * fan-out; the per-frame loop reads `state.settings.galaxyCatalogs.depthFade`
 * directly.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setDepthFade(state: EngineSettingsState, depthFade: boolean): EngineSettingsState {
  return { ...state, galaxyCatalogs: { ...state.galaxyCatalogs, depthFade } };
}
