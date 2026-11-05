import { describe, expect, it } from 'vitest';

import type { SampledTrack } from '../../../src/@types/scene/SampledTrack';
import { hermiteTrackAt } from '../../../src/utils/orbit/hermiteTrackAt';
import FLYBY from '../../fixtures/voyager1TitanFlyby.json';

const DAY_S = 86_400;

// A cubic in time (days): Hermite on cubic data is exact, so any error is a formula bug.
const cubic = (t: number): [number, number, number] => [
  1e6 + 3e5 * t + 2e4 * t * t - 1e3 * t * t * t,
  -5e5 + 1e5 * t - 4e3 * t * t + 7e2 * t * t * t,
  2e5 + 8e4 * t + 1e4 * t * t + 5e2 * t * t * t,
];
const cubicVelKmS = (t: number): [number, number, number] => [
  (3e5 + 4e4 * t - 3e3 * t * t) / DAY_S,
  (1e5 - 8e3 * t + 2.1e3 * t * t) / DAY_S,
  (8e4 + 2e4 * t + 1.5e3 * t * t) / DAY_S,
];

const T0 = 2444000.5;
const OFFSETS = [0, 3, 7, 12];
const track: SampledTrack = {
  id: 'x',
  tDays: Float64Array.from(OFFSETS, (d) => T0 + d),
  posKm: Float64Array.from(OFFSETS.flatMap((d) => cubic(d))),
  velKmS: Float32Array.from(OFFSETS.flatMap((d) => cubicVelKmS(d))),
};

describe('hermiteTrackAt', () => {
  it('reproduces samples exactly and an analytic arc between them', () => {
    expect(hermiteTrackAt(track, T0 + 3)).toEqual([...cubic(3)]);
    const mid = hermiteTrackAt(track, T0 + 5.25);
    const expected = cubic(5.25);
    // f32 velocities cap the match at ~1 km on a 1e6 km arc.
    for (let k = 0; k < 3; k++) expect(Math.abs(mid[k]! - expected[k]!)).toBeLessThan(1);
  });

  it('clamps past the last sample', () => {
    expect(hermiteTrackAt(track, T0 + 400)).toEqual([...cubic(12)]);
  });

  it('Voyager 1 at Titan closest approach is within 1 km of Horizons', () => {
    const { track: slice, horizons } = FLYBY;
    const t: SampledTrack = {
      id: 'voyager1',
      tDays: Float64Array.from(slice.tDays),
      posKm: Float64Array.from(slice.posKm),
      velKmS: Float32Array.from(slice.velKmS),
    };
    for (const h of horizons) {
      const p = hermiteTrackAt(t, h.jd);
      const err = Math.hypot(p[0] - h.posKm[0]!, p[1] - h.posKm[1]!, p[2] - h.posKm[2]!);
      expect(err, `jd ${h.jd}`).toBeLessThan(1);
    }
  });
});
