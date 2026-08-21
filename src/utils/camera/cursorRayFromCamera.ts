/**
 * cursorRayFromCamera — the world-space ray through a cursor position, resolved
 * from a whole `OrbitCamera` rather than the eight loose terms `cursorRayWorld`
 * takes. Two sites need the identical derivation (the hover surface-hit in
 * `wireInput`, the zoom anchor in `cursorZoomStep`), and the screen basis it
 * feeds — `cam.roll` + `frameUp(cam.upBasis)` — is exactly what
 * `computeViewProj` renders with, so a ray built any other way silently misses
 * whatever the user is pointing at.
 */

import { cursorRayWorld } from './cursorRayWorld';
import { frameUp } from './frameUp';
import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Vec3 } from '../../@types/math/Vec3';

export function cursorRayFromCamera(
  cam: OrbitCamera,
  cursorCss: Readonly<{ x: number; y: number }>,
  canvasCssSize: Readonly<{ width: number; height: number }>,
): { readonly origin: Vec3; readonly direction: Vec3 } {
  const fx = cam.target[0] - cam.position[0];
  const fy = cam.target[1] - cam.position[1];
  const fz = cam.target[2] - cam.position[2];
  const flen = Math.hypot(fx, fy, fz) || 1;
  const forward: Vec3 = [fx / flen, fy / flen, fz / flen];

  return cursorRayWorld(
    cursorCss,
    canvasCssSize,
    cam.position,
    forward,
    cam.roll ?? 0,
    frameUp(cam.upBasis),
    cam.fovYRad,
    cam.aspect,
  );
}
