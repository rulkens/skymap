/**
 * surfaceFloorM — the metre-space descent floor above a body's surface.
 *
 * Reads `SURFACE_STANDOFF_RADII` from its single Mpc-space declaration
 * (`clampDistance.ts`) rather than re-declaring the ratio here, so the
 * orbit-camera's distance clamp and the surface-descent gesture can never
 * disagree about where the ground is (spec §10).
 */

import { SURFACE_STANDOFF_RADII } from './clampDistance';

export function surfaceFloorM(bodyRadiusM: number): number {
  return bodyRadiusM * SURFACE_STANDOFF_RADII;
}
