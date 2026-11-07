/**
 * altAzFromSpot — where a world-frame target stands in a spot's sky: compass
 * azimuth (0 = north, π/2 = east, the convention of `refAzimuthOf`) and altitude.
 * The direction is taken from the host's centre, not the spot: the surface
 * offset is ~1e-4 rad even for the Sun, and a body target is never close enough
 * for it to matter at sky-readout precision.
 */

import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';
import type { PositionedId } from '../../@types/scene/PositionedId';
import { siteEyeFrame } from '../../services/engine/camera/arms/utils/siteEyeFrame';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { skySpotRadial } from '../geo/skySpotRadial';
import { dot3 } from '../math/dot3';
import { normalize3 } from '../math/normalize3';

export function altAzFromSpot(
  spot: SkySpot,
  targetWorldMpc: Readonly<Vec3>,
  simDays: number,
): { azimuthRad: number; altitudeRad: number } {
  const host = deriveBodyStates(simDays).get(spot.body as unknown as PositionedId);
  if (host === undefined) throw new Error(`altAzFromSpot: no state for '${spot.body}'`);
  const w = normalize3([
    targetWorldMpc[0] - host.positionMpc[0],
    targetWorldMpc[1] - host.positionMpc[1],
    targetWorldMpc[2] - host.positionMpc[2],
  ]);
  // Rᵀ·w: the world direction in the host's body-fixed axes (R is local → world).
  const m = host.orientation;
  const d: Vec3 = [
    m[0] * w[0] + m[1] * w[1] + m[2] * w[2],
    m[3] * w[0] + m[4] * w[1] + m[5] * w[2],
    m[6] * w[0] + m[7] * w[1] + m[8] * w[2],
  ];
  const { east, north, localUp } = siteEyeFrame(skySpotRadial(spot));
  return {
    azimuthRad: Math.atan2(dot3(d, east), dot3(d, north)),
    altitudeRad: Math.asin(Math.min(1, Math.max(-1, dot3(d, localUp)))),
  };
}
