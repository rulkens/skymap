/**
 * isInsideAtmosphereShell — a RENDER-PATH selector, not a geometric predicate:
 * it deliberately returns true slightly OUTSIDE the atmosphere-TOP unit sphere
 * (in the shell's local, atmosphere-top-radius frame). The full-screen inside
 * path is exact for any camera position, but the proxy-mesh outside path
 * degrades within the 128×64 proxy's facet sag (~6e-4 · R — a camera inside
 * the polyhedron but outside the true sphere loses the near wall and its
 * over-disc haze). `INSIDE_PATH_ENTER_RATIO` clears that band by ~8×; above it
 * the two paths are pixel-identical, so the handoff is invisible. Being ratio-
 * based (not an absolute margin) scales with each body's top radius for free.
 */

import type { Vec3 } from '../../@types/math/Vec3';

const INSIDE_PATH_ENTER_RATIO = 1.005;

export function isInsideAtmosphereShell(camPosLocal: Readonly<Vec3>): boolean {
  return Math.hypot(camPosLocal[0], camPosLocal[1], camPosLocal[2]) < INSIDE_PATH_ENTER_RATIO;
}
