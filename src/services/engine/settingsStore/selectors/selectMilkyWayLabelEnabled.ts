/**
 * selectMilkyWayLabelEnabled — pure projection of the Milky-Way label toggle.
 *
 * The read seam shared by both sides: React subscribes with
 * `useSettingsStore(handleRef, selectMilkyWayLabelEnabled, …)` and re-renders
 * only when the value changes; the engine reads the same field off
 * `state.settings.milkyWay.labelEnabled` each frame. The projection returns a
 * PRIMITIVE boolean, so `useSyncExternalStore` can compare snapshots by value
 * (`Object.is`) and skip the render when nothing moved — a record/object return
 * would compare by reference and re-render on every store write. A free
 * function (not a method) carries no framework dependency and stays trivially
 * unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectMilkyWayLabelEnabled(state: EngineSettingsState): boolean {
  return state.milkyWay.labelEnabled;
}
