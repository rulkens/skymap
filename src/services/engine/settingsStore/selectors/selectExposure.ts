/**
 * selectExposure — pure projection of the HDR tone-map exposure multiplier.
 *
 * The read seam shared by both sides: React subscribes with
 * `useSettingsStore(handleRef, selectExposure, …)` and re-renders only when the
 * value changes; the engine reads the same field off
 * `state.settings.tonemap.exposure`. The projection returns a PRIMITIVE number,
 * so `useSyncExternalStore` can compare snapshots by value (`Object.is`) and
 * skip the render when nothing moved — a record/object return would compare by
 * reference and re-render on every store write. A free function (not a method)
 * carries no framework dependency and stays trivially unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectExposure(state: EngineSettingsState): number {
  return state.tonemap.exposure;
}
