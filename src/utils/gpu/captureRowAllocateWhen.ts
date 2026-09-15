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

// 1.5x a band's `goneAt` — 750 AU for `sky-cubemap`, whose 1024² x 6 x 8 B is
// 50 MB + 7 views, the costliest row to churn.
const CAPTURE_ROW_RELEASE_MARGIN = 1.5;

export function captureRowAllocateWhen(
  key: SkyCaptureKey,
): (state: EngineState, isAllocated: boolean) => boolean {
  return (state, isAllocated) => {
    const runtime = state.cubemapCaptures[key];
    if (runtime.lastBandActive) return true;
    return (
      isAllocated &&
      runtime.lastAnchorDistanceMpc <=
        CAPTURE_ROW_RELEASE_MARGIN * CUBEMAP_CAPTURES[key].band.goneAt
    );
  };
}
