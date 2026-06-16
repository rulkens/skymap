/**
 * selectTier — pure projection of the data-resolution preset.
 *
 * The read seam shared by both sides: React subscribes with
 * `useSettingsStore(handleRef, selectTier, …)` and re-renders only when the
 * tier changes; the engine wiring reads the same field off
 * `state.settings.tier`. The projection returns a PRIMITIVE string union, so
 * `useSyncExternalStore` can compare snapshots by value (`Object.is`) and skip
 * the render when nothing moved — a record/object return would compare by
 * reference and re-render on every store write. A free function (not a method)
 * carries no framework dependency and stays trivially unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { Tier } from '../../../../@types/data/Tier';

export function selectTier(state: EngineSettingsState): Tier {
  return state.tier;
}
