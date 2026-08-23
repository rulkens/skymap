/**
 * cursorZoomStep — what one wheel notch / pinch tick does to the pose, given
 * where the cursor is. Re-picks the surface point under the cursor EVERY tick
 * and hands it to `zoomedEyeStep` as the anchor: the statelessness is the
 * point — no anchor is remembered between ticks, so no gesture boundary can
 * swap one out from under the camera. No pivot surface at all → plain
 * proportional distance scaling, unchanged from deep-space behaviour.
 */

import { cursorRayFromCamera } from './cursorRayFromCamera';
import { eyeAltitudeMpc } from './eyeAltitudeMpc';
import { zoomedEyeStep } from './zoomedEyeStep';
import { SURFACE_STANDOFF_RADII } from './surfaceStandoffRadii';
import { raySphereRoots } from '../math/raySphereRoots';
import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Vec3 } from '../../@types/math/Vec3';
import type { ZoomStep } from '../../@types/camera/ZoomStep';

export function cursorZoomStep(
  cam: OrbitCamera,
  cursorCss: Readonly<{ x: number; y: number }>,
  canvasCssSize: Readonly<{ width: number; height: number }>,
  pivot: { readonly centreMpc: Readonly<Vec3>; readonly radiusMpc: number } | null,
  factor: number,
): ZoomStep {
  if (pivot === null) return { distanceScale: factor, lateralMpc: [0, 0, 0] };

  const altitude = eyeAltitudeMpc(cam.position, pivot.centreMpc, pivot.radiusMpc);

  // Anchored zoom is IN-ONLY, and reads like a missing feature. It is not: an
  // anchor is the fixed point of the map the eye follows, so it attracts below
  // `factor` 1 and REPELS above it, walking the pivot off the body by
  // ~altitude·tan(cursor angle) per notch at every scale. Out is therefore the
  // bare altitude taper along the view axis — the pivot does not move at all,
  // and the growing altitude shrinks its angular offset back to nothing, which
  // is the spec's "reverts cleanly to centre-directed zoom on zoom-out and on a
  // cursor miss" (Goals, spec:73-75; acceptance criterion, spec:500). The zero
  // is returned LITERALLY rather than left to fall out of the anchor algebra:
  // `addFollowPan` of an exact zero leaves `followPanStored` byte-identical, and
  // the rounding residual of the equivalent anchor route does not.
  if (factor >= 1) {
    return {
      distanceScale: 1 + ((factor - 1) * altitude) / cam.distance,
      lateralMpc: [0, 0, 0],
    };
  }

  const ray = cursorRayFromCamera(cam, cursorCss, canvasCssSize);
  const roots = raySphereRoots(ray.origin, ray.direction, pivot.centreMpc, pivot.radiusMpc);
  // `tNear` is the front-facing crossing; a negative one means the sphere is
  // behind the eye, which is not something the cursor is pointing at.
  const tNear = roots !== null && roots[0] > 0 ? roots[0] : null;

  const anchorMpc: Vec3 =
    tNear !== null
      ? [
          ray.origin[0] + tNear * ray.direction[0],
          ray.origin[1] + tNear * ray.direction[1],
          ray.origin[2] + tNear * ray.direction[2],
        ]
      : altitudeAnchorMpc(cam, pivot.centreMpc, altitude);

  return zoomedEyeStep(
    cam.position,
    cam.target,
    anchorMpc,
    pivot.centreMpc,
    pivot.radiusMpc * SURFACE_STANDOFF_RADII,
    factor,
  );
}

/**
 * The miss anchor: the body's surface point directly under the eye, one
 * altitude along the eye→centre line. Aimed at the BODY, not at `cam.target` —
 * the two coincide until a pan or an anchored zoom strafes the pivot off the
 * body, and past that point aiming at the pivot makes the strafe permanent.
 */
function altitudeAnchorMpc(cam: OrbitCamera, centreMpc: Readonly<Vec3>, altitude: number): Vec3 {
  const cx = centreMpc[0] - cam.position[0];
  const cy = centreMpc[1] - cam.position[1];
  const cz = centreMpc[2] - cam.position[2];
  const clen = Math.hypot(cx, cy, cz) || 1;
  return [
    cam.position[0] + (cx / clen) * altitude,
    cam.position[1] + (cy / clen) * altitude,
    cam.position[2] + (cz / clen) * altitude,
  ];
}
