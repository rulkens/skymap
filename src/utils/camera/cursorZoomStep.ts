/**
 * cursorZoomStep — what one wheel notch / pinch tick does to the pose, given
 * where the cursor is. Re-picks the surface point under the cursor EVERY tick
 * and hands it to `zoomedEyeStep` as the anchor: the statelessness is the
 * point — no anchor is remembered between ticks, so no gesture boundary can
 * swap one out from under the camera.
 *
 * Zoom-out, and a cursor miss, fall back to the centre-directed anchor below.
 * No pivot surface at all → plain proportional distance scaling, unchanged
 * from deep-space behaviour.
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

  const ray = cursorRayFromCamera(cam, cursorCss, canvasCssSize);
  const roots = raySphereRoots(ray.origin, ray.direction, pivot.centreMpc, pivot.radiusMpc);
  // `tNear` is the front-facing crossing; a negative one means the sphere is
  // behind the eye, which is not something the cursor is pointing at.
  const tNear = roots !== null && roots[0] > 0 ? roots[0] : null;

  // The anchor is the fixed point of the map the eye follows, so the zoom
  // DIRECTION decides which one the pivot can afford. Reads like a missing
  // feature; is not (spec §4.2: "reverts cleanly to centre-directed zoom on
  // zoom-out and on a cursor miss"). Zooming in pulls the eye ONTO the anchor,
  // so the cursor point is safe and a miss aims at the body, dragging an
  // off-body pivot back to it. Zooming out pushes the eye AWAY, multiplying any
  // off-axis anchor offset by `factor` every notch — so out aims down the view
  // axis, the one aim with no lateral at all, and the growing altitude shrinks
  // the pivot's angular offset back to nothing.
  const anchorMpc: Vec3 =
    factor >= 1
      ? altitudeAnchorMpc(cam, cam.target, pivot.centreMpc, pivot.radiusMpc)
      : tNear !== null
        ? [
            ray.origin[0] + tNear * ray.direction[0],
            ray.origin[1] + tNear * ray.direction[1],
            ray.origin[2] + tNear * ray.direction[2],
          ]
        : altitudeAnchorMpc(cam, pivot.centreMpc, pivot.centreMpc, pivot.radiusMpc);

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
 * A point one eye-ALTITUDE ahead along the eye→`aimMpc` line: zooming toward it
 * moves the eye by `altitude · (factor − 1)`, the centred taper expressed in
 * eye currency. Only the aim varies — the length is always measured against the
 * body — and the two aims are not interchangeable once the pivot has drifted
 * off the body, which is the whole reason the caller branches.
 */
function altitudeAnchorMpc(
  cam: OrbitCamera,
  aimMpc: Readonly<Vec3>,
  centreMpc: Readonly<Vec3>,
  radiusMpc: number,
): Vec3 {
  const ax = aimMpc[0] - cam.position[0];
  const ay = aimMpc[1] - cam.position[1];
  const az = aimMpc[2] - cam.position[2];
  const alen = Math.hypot(ax, ay, az) || 1;
  const altitude = eyeAltitudeMpc(cam.position, centreMpc, radiusMpc);
  return [
    cam.position[0] + (ax / alen) * altitude,
    cam.position[1] + (ay / alen) * altitude,
    cam.position[2] + (az / alen) * altitude,
  ];
}
