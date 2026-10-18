/**
 * composeLayerBoost — this frame's observer frame: the one answering Layer's `boost`, or `null`
 * (the rest frame). No arbitration: `createLayers` already refused a composition with two
 * Layers declaring `boost`.
 */

import type { FrameBoost } from '../../@types/engine/frame/FrameBoost';
import type { LayerInstance } from '../../@types/engine/layer/LayerInstance';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';

export function composeLayerBoost(
  layers: readonly LayerInstance[],
  settings: EngineSettingsState,
  simDays: number,
): FrameBoost | null {
  for (const layer of layers) {
    const boost = layer.boost?.(settings, simDays) ?? null;
    if (boost !== null) return boost;
  }
  return null;
}
