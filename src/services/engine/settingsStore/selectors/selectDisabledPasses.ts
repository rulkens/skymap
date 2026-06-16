/**
 * selectDisabledPasses — pure projection of the DebugPanel's per-pass override set.
 *
 * The read seam shared by both sides: React subscribes with
 * `useSettingsStore(handleRef, selectDisabledPasses, …)` to drive the
 * renderer-toggle checkboxes, and the frame encoders read the same set off
 * `state.settings.debug.disabledPasses` to skip a disabled pass.
 *
 * Unlike the boolean debug selectors this returns an OBJECT (the `ReadonlySet`),
 * which `useSyncExternalStore` compares by reference. That is safe BECAUSE the
 * store is copy-on-write: `setPassDisabled` mints a new `Set` only on a toggle,
 * and every unrelated write preserves the `debug` cluster's reference — so the
 * snapshot is referentially stable between toggles and React re-renders exactly
 * when the membership changes. (Same contract as `selectStructureItems` returning
 * its items record.) A free function carries no framework dependency and stays
 * trivially unit-testable.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';

export function selectDisabledPasses(state: EngineSettingsState): ReadonlySet<string> {
  return state.debug.disabledPasses;
}
