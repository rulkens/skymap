/**
 * setDepthFade — pure reducer for the survey depth-fade toggle.
 *
 * Copy-on-write at the `surveys` cluster only (new top-level + new `surveys`
 * ref, siblings untouched), the same structural-sharing contract every
 * settings reducer keeps. The boolean rides in verbatim — no clamp, no derived
 * fan-out; the per-frame loop reads `state.settings.surveys.depthFade`
 * directly.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setDepthFade(state: EngineSettingsState, depthFade: boolean): EngineSettingsState {
  return { ...state, surveys: { ...state.surveys, depthFade } };
}
