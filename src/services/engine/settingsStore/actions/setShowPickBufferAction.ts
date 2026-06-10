/**
 * setShowPickBufferAction — the thin imperative bridge for the pick-buffer
 * debug-overlay toggle.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setShowPickBuffer`); the action adds nothing but the
 * `setState` call.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setShowPickBuffer } from '../reducers/setShowPickBuffer';

export function setShowPickBufferAction(store: SettingsStore, show: boolean): void {
  store.setState((s) => setShowPickBuffer(s, show));
}
