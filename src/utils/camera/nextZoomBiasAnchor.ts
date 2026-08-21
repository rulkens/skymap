/**
 * nextZoomBiasAnchor — reference-identity capture for the zoom-bias anchor
 * (spec §4.2: written once at zoom-gesture start, not re-picked every wheel
 * tick). `hoveredSurfacePoint` (`wireInput.ts`) changes reference only on
 * `pointermove`, so recapturing exactly when `hoveredNow` is a DIFFERENT
 * reference than the last captured source mirrors `hoverPickDriver.ts`'s
 * `latest === picked` idiom. `hoveredNow === null` also leaves it untouched.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { LonLatDeg } from '../../@types/scene/LonLatDeg';

type ZoomBiasAnchor = { readonly bodyId: BodyId; readonly point: LonLatDeg } | null;

export function nextZoomBiasAnchor(
  currentAnchor: ZoomBiasAnchor,
  lastCaptureSource: ZoomBiasAnchor,
  hoveredNow: ZoomBiasAnchor,
): {
  readonly anchor: ZoomBiasAnchor;
  readonly captureSource: ZoomBiasAnchor;
} {
  if (hoveredNow === null || hoveredNow === lastCaptureSource) {
    return { anchor: currentAnchor, captureSource: lastCaptureSource };
  }
  return { anchor: hoveredNow, captureSource: hoveredNow };
}
