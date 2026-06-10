/**
 * setRealOnly — pure reducer for the "real orientations only" debug toggle
 * (suppress the procedural sign-bit fallback so only measured PAs draw disks).
 *
 * Copy-on-write at the `surveys` cluster only (new top-level + new `surveys`
 * ref, siblings untouched) — the shared settings-reducer contract. The boolean
 * stores verbatim; the renderer reads `state.settings.surveys.realOnly` each
 * frame.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setRealOnly(state: EngineSettingsState, realOnly: boolean): EngineSettingsState {
  return { ...state, surveys: { ...state.surveys, realOnly } };
}
