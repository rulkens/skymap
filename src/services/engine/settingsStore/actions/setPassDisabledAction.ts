/**
 * setPassDisabledAction — the thin imperative bridge for the DebugPanel's
 * per-pass on/off override.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setPassDisabled`); the action adds nothing but the
 * `setState` call.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setPassDisabled } from '../reducers/setPassDisabled';

export function setPassDisabledAction(store: SettingsStore, name: string, disabled: boolean): void {
  store.setState((s) => setPassDisabled(s, name, disabled));
}
