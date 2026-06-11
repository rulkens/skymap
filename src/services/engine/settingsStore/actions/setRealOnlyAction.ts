/**
 * setRealOnlyAction — the thin imperative bridge for the "real orientations
 * only" debug toggle. Runs the pure `setRealOnly` reducer through
 * `store.setState`.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setRealOnly } from '../reducers/setRealOnly';

export function setRealOnlyAction(store: SettingsStore, realOnly: boolean): void {
  store.setState((s) => setRealOnly(s, realOnly));
}
