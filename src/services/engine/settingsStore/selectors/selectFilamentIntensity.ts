/**
 * selectFilamentIntensity — pure projection of the filament-skeleton intensity
 * scale.
 *
 * The read seam shared by both sides: React subscribes with
 * `useSettingsStore(handleRef, selectFilamentIntensity, …)` and re-renders only
 * when the value changes; the engine reads the same field off
 * `state.settings.filaments.intensity` each frame. The projection returns a
 * PRIMITIVE number, so `useSyncExternalStore` can compare snapshots by value
 * (`Object.is`) and skip the render when nothing moved. A free function (not a
 * method) carries no framework dependency and stays trivially unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectFilamentIntensity(state: EngineSettingsState): number {
  return state.filaments.intensity;
}
