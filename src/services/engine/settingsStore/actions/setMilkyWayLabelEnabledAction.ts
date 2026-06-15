/**
 * setMilkyWayLabelEnabledAction — the thin imperative bridge for the Milky-Way
 * label toggle.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setMilkyWayLabelEnabled`); the action adds nothing but
 * the `setState` call. The cosmetic fade ramp stays in the handle setter
 * alongside this action — it's a render side-effect, not a settings write.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setMilkyWayLabelEnabled } from '../reducers/setMilkyWayLabelEnabled';

export function setMilkyWayLabelEnabledAction(store: SettingsStore, labelEnabled: boolean): void {
  store.setState((s) => setMilkyWayLabelEnabled(s, labelEnabled));
}
