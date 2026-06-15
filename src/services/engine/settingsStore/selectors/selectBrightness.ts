/**
 * selectBrightness — pure projection of the shared galaxy catalog billboard brightness.
 *
 * The read seam shared by both sides: React subscribes with
 * `useStore(store, selectBrightness)` and re-renders only when the value
 * changes; the engine reads the same field off `state.settings.galaxyCatalogs.brightness`.
 * A free function (not a method) carries no framework dependency and stays
 * trivially unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectBrightness(state: EngineSettingsState): number {
  return state.galaxyCatalogs.brightness;
}
