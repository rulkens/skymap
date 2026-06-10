/**
 * selectRealOnly — pure projection of the "real orientations only" debug toggle.
 *
 * React subscribes with `useStore(store, selectRealOnly)`; the engine reads
 * `state.settings.surveys.realOnly`. A free function with no framework
 * dependency, trivially unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectRealOnly(state: EngineSettingsState): boolean {
  return state.surveys.realOnly;
}
