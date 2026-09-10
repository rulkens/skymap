/** The metre-space descent floor above a body's surface, off the ratio's one
 * Mpc-space home (`clampDistance`) so the two cannot disagree (spec §10). */

import { SURFACE_STANDOFF_RADII } from './clampDistance';

export function surfaceFloorM(bodyRadiusM: number): number {
  return bodyRadiusM * SURFACE_STANDOFF_RADII;
}
