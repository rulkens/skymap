/**
 * captureRowAllocateWhen — the `allocateWhen` a sky capture's target row wants:
 * hold the texture while the band is open, plus a hysteresis margin past its
 * `goneAt` — without one, a camera dithering across the band edge destroys and
 * reallocates the row every frame. A row never allocated does not spring into
 * existence from proximity alone: only `lastBandActive` triggers the first.
 */

import type { EngineState } from '../../@types/engine/state/EngineState';
import type { SkyCaptureKey } from '../../@types/rendering/SkyCaptureKey';
import { CUBEMAP_CAPTURES } from '../../data/rendering/cubemapCaptures';

export function captureRowAllocateWhen(
  key: SkyCaptureKey,
  releaseMargin: number,
): (state: EngineState, isAllocated: boolean) => boolean {
  return (state, isAllocated) => {
    const runtime = state.cubemapCaptures[key];
    if (runtime.lastBandActive) return true;
    return (
      isAllocated &&
      runtime.lastAnchorDistanceMpc <= releaseMargin * CUBEMAP_CAPTURES[key].band.goneAt
    );
  };
}
