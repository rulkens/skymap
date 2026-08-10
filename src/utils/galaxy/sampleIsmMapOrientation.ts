/**
 * sampleIsmMapOrientation — nearest-texel read of a `GalaxyIsmMapOrientation`
 * at a world (radius, angle). Ring and azimuth lookup are the shared
 * `ismMapRingIndexForSample`/`ismMapAzIndexForAngle` — also used by
 * `sampleGalaxyIsmMap` — so the two samplers can never silently disagree
 * about which texel a world point lands in. Nearest-texel, not
 * interpolated: the double-angle vector wraps at π, and interpolating angle
 * directly (rather than the packed vector) would average opposite
 * orientations into a false perpendicular — nearest texel sidesteps the
 * question entirely rather than getting it wrong.
 */
import { ismMapAzIndexForAngle } from './ismMapAzIndexForAngle';
import { ismMapRingIndexForSample } from './ismMapRingIndexForSample';
import type { GalaxyIsmMapOrientation } from '../../@types/galaxy/GalaxyIsmMapOrientation';

export type GalaxyIsmMapOrientationSample = {
  readonly angle: number;
  readonly coherence: number;
};

export function sampleIsmMapOrientation(
  map: GalaxyIsmMapOrientation,
  radius: number,
  angle: number,
): GalaxyIsmMapOrientationSample {
  const { az, rings, rMin, rMax, data } = map;
  const ring = ismMapRingIndexForSample(radius, rings, rMin, rMax);
  const azIdx = ismMapAzIndexForAngle(angle, az);
  const i = (ring * az + azIdx) * 2;
  const cos2 = data[i]!;
  const sin2 = data[i + 1]!;
  return {
    angle: 0.5 * Math.atan2(sin2, cos2),
    coherence: Math.hypot(cos2, sin2),
  };
}
