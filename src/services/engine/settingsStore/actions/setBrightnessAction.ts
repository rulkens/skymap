/**
 * setBrightnessAction — the thin imperative bridge for the shared galaxy catalog
 * billboard brightness.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setBrightness`); the action adds nothing but the
 * `setState` call.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setBrightness } from '../reducers/setBrightness';

export function setBrightnessAction(store: SettingsStore, brightness: number): void {
  store.setState((s) => setBrightness(s, brightness));
}
