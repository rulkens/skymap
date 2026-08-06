/**
 * sampleIsmMapOrientation — nearest-texel read of a `GalaxyIsmMapOrientation`
 * at a world (radius, angle), mirroring `sampleGalaxyIsmMap`'s ring/az lookup
 * and angle convention (`atan2(z, x)`, wrapped into [0, 2π)) so the two
 * samplers can never silently disagree about which texel a world point
 * lands in. Nearest-texel, not interpolated: the double-angle vector wraps
 * at π, and interpolating angle directly (rather than the packed vector)
 * would average opposite orientations into a false perpendicular — nearest
 * texel sidesteps the question entirely rather than getting it wrong.
 */
import { ismMapRingRadius } from './ismMapRingRadius';
import type { GalaxyIsmMapOrientation } from '../../@types/galaxy/GalaxyIsmMapOrientation';

export type GalaxyIsmMapOrientationSample = {
  readonly angle: number;
  readonly coherence: number;
};

function ringForRadius(radius: number, rings: number, rMin: number, rMax: number): number {
  const clamped = Math.min(Math.max(radius, rMin), rMax);
  let lo = 0;
  let hi = rings - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ismMapRingRadius(mid, rings, rMin, rMax) <= clamped) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function sampleIsmMapOrientation(
  map: GalaxyIsmMapOrientation,
  radius: number,
  angle: number,
): GalaxyIsmMapOrientationSample {
  const { az, rings, rMin, rMax, data } = map;
  const ring = ringForRadius(radius, rings, rMin, rMax);
  const wrapped = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const azIdx = Math.min(az - 1, Math.floor((wrapped / (2 * Math.PI)) * az));
  const i = (ring * az + azIdx) * 2;
  const cos2 = data[i]!;
  const sin2 = data[i + 1]!;
  return {
    angle: 0.5 * Math.atan2(sin2, cos2),
    coherence: Math.hypot(cos2, sin2),
  };
}
