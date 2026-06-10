/**
 * setSurveySizeAction — the thin imperative bridge for the shared survey
 * billboard pixel radius.
 *
 * Actions are the seam the engine's handle setters delegate to: they run a pure
 * reducer through `store.setState`, which is the only place a write actually
 * lands. Keeping the imperative shell this thin means all the transition logic
 * stays in the pure, unit-testable reducer (`setSurveySize`) — the action adds
 * nothing but the `setState` call. The alternative (mutating `store.getState()`
 * in place) would skip copy-on-write and defeat the ref-stability that lets
 * React selectors and the engine's per-frame reads stay cheap.
 */

import type { SettingsStore } from '../createSettingsStore';
import { setSurveySize } from '../reducers/setSurveySize';

export function setSurveySizeAction(store: SettingsStore, sizePx: number): void {
  store.setState((s) => setSurveySize(s, sizePx));
}
