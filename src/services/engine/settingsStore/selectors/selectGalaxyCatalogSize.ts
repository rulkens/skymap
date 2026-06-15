/**
 * selectGalaxyCatalogSize — pure projection of the shared galaxy catalog billboard pixel
 * radius out of the settings state.
 *
 * Selectors are the read seam shared by both sides: React subscribes with
 * `useStore(store, selectGalaxyCatalogSize)` and re-renders only when the projected
 * value changes; the engine can read the same field directly off
 * `state.settings.galaxyCatalogs.sizePx` or via `selectGalaxyCatalogSize(store.getState())`.
 * Keeping the projection a free function (not a method) means it carries no
 * framework dependency and stays trivially unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectGalaxyCatalogSize(state: EngineSettingsState): number {
  return state.galaxyCatalogs.sizePx;
}
