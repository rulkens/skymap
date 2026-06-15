/**
 * setGalaxyCatalogSize — pure reducer for the shared galaxy catalog billboard pixel radius.
 *
 * Copy-on-write at the touched cluster only: it returns a new top-level state
 * and a new `galaxyCatalogs` object, but leaves every sibling cluster (`tonemap`,
 * `structures`, …) at its existing reference. That ref-stability is what lets
 * React selectors over untouched clusters skip re-rendering, and what keeps the
 * engine's per-frame `state.settings` reads cheap (the snapshot only changes
 * shape where a write actually landed). Mutating the input in place would
 * defeat both — hence the spread rather than `state.galaxyCatalogs.sizePx = sizePx`.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setGalaxyCatalogSize(state: EngineSettingsState, sizePx: number): EngineSettingsState {
  return { ...state, galaxyCatalogs: { ...state.galaxyCatalogs, sizePx } };
}
