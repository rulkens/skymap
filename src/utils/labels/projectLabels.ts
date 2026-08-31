/**
 * projectLabels — projects every label's world anchor to screen space (device
 * px, +Y down), once per frame, via the shared `forwardProjectPoint` primitive.
 * The ONE projection walk for the two consumers that must agree on where a
 * label sits on screen — the COSMO/NEAR0 declutter arms and the pick-quad
 * emitter — so a label can't be decluttered against one screen position and
 * clicked at another.
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import type { Label2DProjected } from '../../@types/rendering/Label2DProjected';
import type { Label2DProjection } from '../../@types/rendering/Label2DProjection';
import type { ForwardProjectedPoint } from '../../@types/camera/ForwardProjectedPoint';
import { forwardProjectPoint } from '../camera/forwardProjectPoint';

export function projectLabels(
  labels: readonly Label2D[],
  projection: Label2DProjection,
): Label2DProjected[] {
  const m = projection.vp;
  const viewportPx = projection.viewportPx;
  // One scratch reused across the whole loop — forwardProjectPoint mutates
  // it in place rather than allocating, per label.
  const scratch: ForwardProjectedPoint = {
    clipX: 0,
    clipY: 0,
    clipZ: 0,
    clipW: 0,
    screenX: 0,
    screenY: 0,
    onScreen: false,
  };
  return labels.map((label) => {
    const wx = label.worldPos[0];
    const wy = label.worldPos[1];
    const wz = label.worldPos[2];
    forwardProjectPoint(m, wx, wy, wz, viewportPx, scratch);
    if (scratch.clipW <= 0) return { screenPx: null, clipW: scratch.clipW, onScreen: false };
    return {
      screenPx: [scratch.screenX, scratch.screenY],
      clipW: scratch.clipW,
      onScreen: scratch.onScreen,
    };
  });
}
