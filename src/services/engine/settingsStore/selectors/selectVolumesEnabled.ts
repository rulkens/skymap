/**
 * selectVolumesEnabled — pure projection of the scalar-volume overlay master
 * gate.
 *
 * The read seam shared by both sides: React subscribes with
 * `useSettingsStore(handleRef, selectVolumesEnabled, …)` and re-renders only
 * when the value changes; the engine reads the same field off
 * `state.settings.volumes.enabled` each frame to gate the volume passes. The
 * projection returns a PRIMITIVE boolean, so `useSyncExternalStore` compares
 * snapshots by value (`Object.is`) and skips the render when nothing moved — an
 * object return would compare by reference and re-render on every store write.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectVolumesEnabled(state: EngineSettingsState): boolean {
  return state.volumes.enabled;
}
