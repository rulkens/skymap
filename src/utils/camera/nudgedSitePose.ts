import type { ArmDelta } from '../../@types/camera/ArmDelta';
import type { SitePose } from '../../@types/camera/SitePose';
import type { MeshBody } from '../../@types/scene/MeshBody';
import type { Vec2 } from '../../@types/math/Vec2';
import { steppedSitePose } from './steppedSitePose';

/**
 * The site turntable's pixel-free motion: zoom → orbit, both through the drag's
 * own step so the gain law and the declined-notch identity stay one
 * derivation. The turntable has no look or roll, so those axes are ignored.
 */
export function nudgedSitePose(
  pose: SitePose,
  delta: ArmDelta,
  body: MeshBody,
  viewportPx: Readonly<Vec2>,
  fovYRad: number,
): SitePose {
  const { orbit, zoom } = delta;
  let next = pose;
  if (zoom !== undefined) {
    next = steppedSitePose(
      next,
      { kind: 'zoom', factor: Math.exp(zoom), duringGesture: false, cursorPx: null },
      body,
      viewportPx,
      fovYRad,
    );
  }
  if (orbit !== undefined) {
    const pxPerRad = viewportPx[1] / fovYRad;
    next = steppedSitePose(
      next,
      {
        kind: 'drag',
        mode: 'orbit',
        startPx: [0, 0],
        endPx: [orbit[0] * pxPerRad, orbit[1] * pxPerRad],
      },
      body,
      viewportPx,
      fovYRad,
    );
  }
  return next;
}
