/**
 * sunCosRadius — cosine of the Sun's angular radius seen from `positionMpc`.
 * The Sun sits at the heliocentric render origin (see `sunDirLocal`); the
 * cosine, not the angle, is what the sky's disc test compares a view ray to.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import { RENDER_ORIGIN_MPC } from '../../data/renderOrigin';
import { SOLAR_RADIUS_KM } from '../../data/bodies/solarRadiusKm';
import { SCALE_UNITS } from '../../data/scaleUnits';

export function sunCosRadius(positionMpc: Readonly<Vec3>): number {
  const distanceMpc = Math.hypot(
    positionMpc[0] - RENDER_ORIGIN_MPC[0],
    positionMpc[1] - RENDER_ORIGIN_MPC[1],
    positionMpc[2] - RENDER_ORIGIN_MPC[2],
  );
  const sinRadius = Math.min(1, (SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_MPC) / distanceMpc);
  return Math.sqrt(1 - sinRadius * sinRadius);
}
