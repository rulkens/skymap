/**
 * selectFilamentsEnabled — pure projection of the filament-skeleton overlay
 * toggle.
 *
 * The read seam shared by both sides: React subscribes with
 * `useSettingsStore(handleRef, selectFilamentsEnabled, …)` and re-renders only
 * when the value changes; the engine reads the same field off
 * `state.settings.filaments.enabled` each frame. The projection returns a
 * PRIMITIVE boolean, so `useSyncExternalStore` can compare snapshots by value
 * (`Object.is`) and skip the render when nothing moved — a record/object return
 * would compare by reference and re-render on every store write. A free
 * function (not a method) carries no framework dependency and stays trivially
 * unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectFilamentsEnabled(state: EngineSettingsState): boolean {
  return state.filaments.enabled;
}
