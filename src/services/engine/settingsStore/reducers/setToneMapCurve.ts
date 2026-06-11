/**
 * setToneMapCurve — pure reducer for the selected HDR → LDR tone-map curve.
 *
 * Copy-on-write at the touched cluster only: a new top-level state and a new
 * `tonemap` object, every sibling cluster left at its existing reference (same
 * structural-sharing contract as `setExposure`). The curve is a `ToneMapCurve`
 * enum value (0..4) that lands verbatim in the post-process `curve: u32`
 * uniform; the reducer stores it as-is.
 */

import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import type { ToneMapCurve } from '../../../../@types/data/ToneMapCurve';

export function setToneMapCurve(
  state: EngineSettingsState,
  curve: ToneMapCurve,
): EngineSettingsState {
  return { ...state, tonemap: { ...state.tonemap, curve } };
}
