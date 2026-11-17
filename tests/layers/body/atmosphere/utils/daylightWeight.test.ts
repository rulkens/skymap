/**
 * daylightWeight — how adapted to daylight the eye inside an atmosphere is. Space, orbit and
 * night must stay exactly as they were tuned (weight 0), and a sunlit ground must take the full
 * daylight gain (weight 1); a regression in either direction is invisible in a unit of the shader.
 */
import { describe, expect, it } from 'vitest';
import { daylightWeight } from '../../../../../src/layers/body/atmosphere/utils/daylightWeight';

const sinDeg = (deg: number): number => Math.sin((deg * Math.PI) / 180);

describe('daylightWeight', () => {
  it('is 1 under the whole column with the Sun well up', () => {
    expect(daylightWeight(1, sinDeg(41))).toBe(1);
  });

  it('is 0 at night, past civil twilight, and with no air above', () => {
    expect(daylightWeight(1, sinDeg(-7))).toBe(0);
    expect(daylightWeight(0, sinDeg(41))).toBe(0);
  });

  it('rises with the Sun through twilight', () => {
    const dusk = [-5, -2, 0, 3].map((deg) => daylightWeight(1, sinDeg(deg)));
    for (let i = 1; i < dusk.length; i++) expect(dusk[i]).toBeGreaterThan(dusk[i - 1]!);
    expect(dusk[0]).toBeGreaterThan(0);
    expect(dusk[3]).toBeLessThan(1);
  });
});
