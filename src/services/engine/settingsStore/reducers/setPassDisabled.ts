/**
 * setPassDisabled — pure reducer for the DebugPanel's per-pass on/off override.
 *
 * Copy-on-write at the touched `debug` cluster only, matching the sibling
 * `setShowPickBuffer` / `setShowDiskRadiusRing` reducers: a new top-level state,
 * a new `debug` object, and a NEW `Set` — every other cluster keeps its existing
 * reference so React selectors over untouched clusters skip re-rendering and the
 * engine's per-frame `state.settings` reads stay cheap.
 *
 * The set is rebuilt rather than mutated in place because the store's value is
 * read as an immutable snapshot: a selector returning the same `Set` reference is
 * how `useSyncExternalStore` knows nothing changed. Adding to / deleting from the
 * held set in place would leave the reference identical, so React would never see
 * the toggle. `disabledPasses` is the open-world membership half (any pass name);
 * the closed-world `HDR_PASSES` / `UI_PASSES` arrays drive the encoder loop that
 * consults it. The override is one-way — it can only hide a pass whose own
 * `enabled()` gate already returned true.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function setPassDisabled(
  state: EngineSettingsState,
  name: string,
  disabled: boolean,
): EngineSettingsState {
  const next = new Set(state.debug.disabledPasses);
  if (disabled) next.add(name);
  else next.delete(name);
  return { ...state, debug: { ...state.debug, disabledPasses: next } };
}
