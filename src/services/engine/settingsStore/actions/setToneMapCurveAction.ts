/**
 * setToneMapCurveAction — the thin imperative bridge for the selected HDR → LDR
 * tone-map curve.
 *
 * Like every action it runs a pure reducer through `store.setState` — the one
 * write site — and adds nothing else, leaving the transition in the
 * unit-testable reducer (`setToneMapCurve`).
 */

import type { SettingsStore } from '../createSettingsStore';
import type { ToneMapCurve } from '../../../../@types/data/ToneMapCurve';
import { setToneMapCurve } from '../reducers/setToneMapCurve';

export function setToneMapCurveAction(store: SettingsStore, curve: ToneMapCurve): void {
  store.setState((s) => setToneMapCurve(s, curve));
}
