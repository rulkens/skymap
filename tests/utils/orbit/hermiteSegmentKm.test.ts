import { describe, expect, it } from 'vitest';

import { hermiteSegmentKm } from '../../../src/utils/orbit/hermiteSegmentKm';

const DAY_S = 86_400;

// A cubic in time (days): Hermite on cubic data is exact on ANY segment, adjacent or not.
const cubic = (t: number): [number, number, number] => [
  1e6 + 3e5 * t - 1e3 * t * t * t,
  -5e5 + 1e5 * t + 7e2 * t * t * t,
  2e5 + 1e4 * t * t,
];
const cubicVelKmS = (t: number): [number, number, number] => [
  (3e5 - 3e3 * t * t) / DAY_S,
  (1e5 + 2.1e3 * t * t) / DAY_S,
  (2e4 * t) / DAY_S,
];

const OFFSETS = [0, 3, 7, 12];
const tDays = Float64Array.from(OFFSETS, (d) => 2444000.5 + d);
const posKm = Float64Array.from(OFFSETS.flatMap((d) => cubic(d)));
const velKmS = Float32Array.from(OFFSETS.flatMap((d) => cubicVelKmS(d)));

describe('hermiteSegmentKm', () => {
  it('evaluates a non-adjacent segment (the decimator skips samples) on the analytic curve', () => {
    const got = hermiteSegmentKm(tDays, posKm, velKmS, 0, 2, tDays[0]! + 5.25);
    const expected = cubic(5.25);
    // f32 velocities cap the match at ~1 km on a 1e6 km arc.
    for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - expected[k]!)).toBeLessThan(1);
  });
});
