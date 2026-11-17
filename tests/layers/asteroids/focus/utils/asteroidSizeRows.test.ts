import { describe, expect, it } from 'vitest';

import { asteroidSizeRows } from '../../../../../src/layers/asteroids/focus/utils/asteroidSizeRows';
import { formatAsteroidDiameter } from '../../../../../src/layers/asteroids/focus/utils/formatAsteroidDiameter';

const measured = (diameterKm: number, albedo: number | null) => ({
  measuredSize: { diameterKm, albedo },
  absoluteMagnitude: 10.39,
});
const unmeasured = (h: number | null) => ({ measuredSize: null, absoluteMagnitude: h });

describe('asteroidSizeRows', () => {
  it('prints a measured diameter to three figures with its albedo (Eros, SBDB)', () => {
    expect(asteroidSizeRows(measured(16.84, 0.25))).toEqual([
      ['Diameter', '16.8 km'],
      ['Albedo', '0.25'],
    ]);
    expect(asteroidSizeRows(measured(147.5, null))).toEqual([['Diameter', '148 km']]);
  });

  it('estimates from H over albedo 0.25 to 0.05 when unmeasured: Eros’s H 10.39 gives 22–50 km', () => {
    expect(asteroidSizeRows(unmeasured(10.39))).toEqual([['Diameter (estimate)', '22–50 km']]);
  });

  it('writes each end’s unit when the range crosses 1 km, and one unit when it does not', () => {
    expect(asteroidSizeRows(unmeasured(17.5))).toEqual([['Diameter (estimate)', '840 m–1.9 km']]);
    expect(asteroidSizeRows(unmeasured(20))).toEqual([['Diameter (estimate)', '270–590 m']]);
  });

  it('has no size row for an asteroid with neither a measurement nor an H', () => {
    expect(asteroidSizeRows(unmeasured(null))).toEqual([]);
  });
});

describe('formatAsteroidDiameter', () => {
  it('switches to metres below 1 km after rounding, and never prints an exponent', () => {
    expect(formatAsteroidDiameter(0.48444, 3)).toBe('484 m');
    expect(formatAsteroidDiameter(0.9996, 3)).toBe('1.00 km');
    expect(formatAsteroidDiameter(16, 3)).toBe('16.0 km');
    expect(formatAsteroidDiameter(1234, 3)).toBe('1,230 km');
  });
});
