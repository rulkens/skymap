/**
 * setAutoRotateAction — the thin imperative bridge for the camera auto-rotate
 * toggle.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setAutoRotate`); the action adds nothing but the
 * `setState` call.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setAutoRotate } from '../reducers/setAutoRotate';

export function setAutoRotateAction(store: SettingsStore, autoRotate: boolean): void {
  store.setState((s) => setAutoRotate(s, autoRotate));
}
