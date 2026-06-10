/**
 * selectSurveySize — pure projection of the shared survey billboard pixel
 * radius out of the settings state.
 *
 * Selectors are the read seam shared by both sides: React subscribes with
 * `useStore(store, selectSurveySize)` and re-renders only when the projected
 * value changes; the engine can read the same field directly off
 * `state.settings.surveys.sizePx` or via `selectSurveySize(store.getState())`.
 * Keeping the projection a free function (not a method) means it carries no
 * framework dependency and stays trivially unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectSurveySize(state: EngineSettingsState): number {
  return state.surveys.sizePx;
}
