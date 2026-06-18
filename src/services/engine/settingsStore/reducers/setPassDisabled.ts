/**
 * setPassDisabled — pure reducer for the DebugPanel's per-pass on/off override.
 *
 * Copy-on-write at the touched `debug` cluster only, matching the sibling
 * `setShowPickBuffer` / `setShowDiskRadiusRing` reducers: a new top-level state,
 * a new `debug` object, and a NEW record — every other cluster keeps its existing
 * reference so React selectors over untouched clusters skip re-rendering and the
 * engine's per-frame `state.settings` reads stay cheap.
 *
 * The record is rebuilt rather than mutated in place because the store's value is
 * read as an immutable snapshot: a selector returning the same reference is how
 * `useSyncExternalStore` knows nothing changed. Writing the held record in place
 * would leave the reference identical, so React would never see the toggle.
 * `disabledPasses` is the open-world membership half (any pass name) where
 * `[name] === true` means disabled; the closed-world `HDR_PASSES` / `UI_PASSES`
 * arrays drive the encoder loop that consults it. The override is one-way — it
 * can only hide a pass whose own `enabled()` gate already returned true.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setPassDisabled(
  state: EngineSettingsState,
  name: string,
  disabled: boolean,
): EngineSettingsState {
  const next = { ...state.debug.disabledPasses, [name]: disabled };
  return { ...state, debug: { ...state.debug, disabledPasses: next } };
}
