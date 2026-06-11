/**
 * selectDepthFade — pure projection of the survey depth-fade toggle.
 *
 * React subscribes with `useStore(store, selectDepthFade)`; the engine reads
 * the same field off `state.settings.surveys.depthFade`. A free function so it
 * carries no framework dependency and stays trivially unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectDepthFade(state: EngineSettingsState): boolean {
  return state.surveys.depthFade;
}
