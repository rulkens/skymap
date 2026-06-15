/**
 * selectHighlightFallback — pure projection of the orientation-fallback
 * highlight debug toggle.
 *
 * React subscribes with `useStore(store, selectHighlightFallback)`; the engine
 * reads `state.settings.galaxyCatalogs.highlightFallback`. A free function with no
 * framework dependency, trivially unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectHighlightFallback(state: EngineSettingsState): boolean {
  return state.galaxyCatalogs.highlightFallback;
}
