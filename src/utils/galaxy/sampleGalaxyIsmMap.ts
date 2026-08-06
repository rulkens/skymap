/**
 * sampleGalaxyIsmMap — nearest-texel read of a CPU-side `GalaxyIsmMap` at a
 * world (radius, angle). The ring lookup inverts `ismMapRingRadius` by
 * SEARCHING it (binary search over its monotonic output) rather than
 * restating its log-radial formula — the two must never disagree about what
 * ring a radius falls in (see that file's header), and calling the shared
 * function is the only way a second formula can't drift from the first.
 * Angle convention matches `ismMapPresent.wesl`'s resample: `atan2(z, x)`,
 * wrapped into [0, 2*PI).
 */
import { ismMapRingRadius } from './ismMapRingRadius';
import type { GalaxyIsmMap } from '../../@types/galaxy/GalaxyIsmMap';

export type GalaxyIsmMapSample = {
  readonly gas: number;
  readonly recentSf: number;
  readonly activity: number;
  readonly dust: number;
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

export function sampleGalaxyIsmMap(
  map: GalaxyIsmMap,
  radius: number,
  angle: number,
): GalaxyIsmMapSample {
  const { az, rings, rMin, rMax, data } = map;
  const ring = ringForRadius(radius, rings, rMin, rMax);
  const wrapped = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const azIdx = Math.min(az - 1, Math.floor((wrapped / (2 * Math.PI)) * az));
  const i = (ring * az + azIdx) * 4;
  return {
    gas: data[i]!,
    recentSf: data[i + 1]!,
    activity: data[i + 2]!,
    dust: data[i + 3]!,
  };
}
