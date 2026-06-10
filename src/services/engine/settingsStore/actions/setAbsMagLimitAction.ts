/**
 * setAbsMagLimitAction — the thin imperative bridge for the volume-limited
 * absolute-magnitude cut.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, the only place a write lands. Keeping the
 * imperative shell this thin leaves all transition logic in the pure,
 * unit-testable reducer (`setAbsMagLimit`); the action adds nothing but the
 * `setState` call.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setAbsMagLimit } from '../reducers/setAbsMagLimit';

export function setAbsMagLimitAction(store: SettingsStore, absMagLimit: number): void {
  store.setState((s) => setAbsMagLimit(s, absMagLimit));
}
