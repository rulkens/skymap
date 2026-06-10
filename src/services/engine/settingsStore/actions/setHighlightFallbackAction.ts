/**
 * setHighlightFallbackAction — the thin imperative bridge for the
 * orientation-fallback highlight debug toggle. Runs the pure
 * `setHighlightFallback` reducer through `store.setState`.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setHighlightFallback } from '../reducers/setHighlightFallback';

export function setHighlightFallbackAction(store: SettingsStore, highlightFallback: boolean): void {
  store.setState((s) => setHighlightFallback(s, highlightFallback));
}
