/**
 * cursorZoomStep — what one wheel notch / pinch tick does to the pose, given
 * where the cursor is. Re-picks the surface point under the cursor EVERY tick
 * and hands it to `zoomedEyeStep` as the anchor: the statelessness is the
 * point — no anchor is remembered between ticks, so no gesture boundary can
 * swap one out from under the camera.
 *
 * Cursor miss → the on-axis anchor one eye-altitude ahead, which scales
 * altitude by `factor` with zero lateral: the centred zoom this replaces,
 * expressed in eye currency. No pivot surface at all → plain proportional
 * distance scaling, unchanged from deep-space behaviour.
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

  const anchorMpc: Vec3 =
    tNear !== null
      ? [
          ray.origin[0] + tNear * ray.direction[0],
          ray.origin[1] + tNear * ray.direction[1],
          ray.origin[2] + tNear * ray.direction[2],
        ]
      : onAxisAnchorMpc(cam, pivot.centreMpc, pivot.radiusMpc);

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
 * The miss anchor: one eye-altitude along the view axis. Zooming toward it
 * moves the eye by `altitude · (factor − 1)` with no lateral component —
 * identical to the old `distance = radius + (distance − radius) · factor`
 * taper while the pivot sits at the body centre, and altitude-correct once it
 * doesn't.
 */
function onAxisAnchorMpc(cam: OrbitCamera, centreMpc: Readonly<Vec3>, radiusMpc: number): Vec3 {
  const fx = cam.target[0] - cam.position[0];
  const fy = cam.target[1] - cam.position[1];
  const fz = cam.target[2] - cam.position[2];
  const flen = Math.hypot(fx, fy, fz) || 1;
  const altitude = eyeAltitudeMpc(cam.position, centreMpc, radiusMpc);
  return [
    cam.position[0] + (fx / flen) * altitude,
    cam.position[1] + (fy / flen) * altitude,
    cam.position[2] + (fz / flen) * altitude,
  ];
}
