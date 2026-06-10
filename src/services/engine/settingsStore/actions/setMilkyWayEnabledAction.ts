/**
 * setMilkyWayEnabledAction — the thin imperative bridge for the Milky-Way disk
 * overlay toggle.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setMilkyWayEnabled`); the action adds nothing but the
 * `setState` call. The cosmetic fade ramp stays in the handle setter alongside
 * this action — it's a render side-effect, not a settings write.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setMilkyWayEnabled } from '../reducers/setMilkyWayEnabled';

export function setMilkyWayEnabledAction(store: SettingsStore, enabled: boolean): void {
  store.setState((s) => setMilkyWayEnabled(s, enabled));
}
