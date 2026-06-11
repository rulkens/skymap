/**
 * setShowDiskRadiusRingAction — the thin imperative bridge for the disk-radius
 * debug-ring toggle.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setShowDiskRadiusRing`); the action adds nothing but
 * the `setState` call.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setShowDiskRadiusRing } from '../reducers/setShowDiskRadiusRing';

export function setShowDiskRadiusRingAction(store: SettingsStore, show: boolean): void {
  store.setState((s) => setShowDiskRadiusRing(s, show));
}
