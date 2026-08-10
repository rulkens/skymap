/**
 * sampleGalaxyIsmMap — nearest-texel read of a CPU-side `GalaxyIsmMap` at a
 * world (radius, angle). Ring and azimuth lookup are the shared
 * `ismMapRingIndexForSample`/`ismMapAzIndexForAngle` — also used by
 * `sampleIsmMapOrientation` — so the two samplers can never silently
 * disagree about which texel a world point lands in.
 */
import { ismMapAzIndexForAngle } from './ismMapAzIndexForAngle';
import { ismMapRingIndexForSample } from './ismMapRingIndexForSample';
import type { GalaxyIsmMap } from '../../@types/galaxy/GalaxyIsmMap';

export type GalaxyIsmMapSample = {
  readonly gas: number;
  readonly stars: number;
  readonly activity: number;
  readonly dust: number;
};

export function sampleGalaxyIsmMap(
  map: GalaxyIsmMap,
  radius: number,
  angle: number,
): GalaxyIsmMapSample {
  const { az, rings, rMin, rMax, data } = map;
  const ring = ismMapRingIndexForSample(radius, rings, rMin, rMax);
  const azIdx = ismMapAzIndexForAngle(angle, az);
  const i = (ring * az + azIdx) * 4;
  return {
    gas: data[i]!,
    stars: data[i + 1]!,
    activity: data[i + 2]!,
    dust: data[i + 3]!,
  };
}
