/**
 * selectToneMapCurve — pure projection of the selected HDR → LDR tone-map curve.
 *
 * React subscribes with `useSettingsStore(handleRef, selectToneMapCurve, …)`;
 * the engine reads the same field off `state.settings.tonemap.curve`. The
 * projection returns a PRIMITIVE `ToneMapCurve` (a numeric-literal enum value),
 * so `useSyncExternalStore` compares snapshots by value and re-renders the
 * curve dropdown only when the selection actually changes — same value-stability
 * contract as `selectExposure`.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { ToneMapCurve } from '../../../../@types/data/ToneMapCurve';

export function selectToneMapCurve(state: EngineSettingsState): ToneMapCurve {
  return state.tonemap.curve;
}
