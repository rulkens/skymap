import { describe, expect, it } from 'vitest';

import { writeAsteroidDiameters } from '../../../../tools/utils/io/writeAsteroidDiameters';
import { parseAsteroidDiameters } from '../../../../src/layers/asteroids/catalog/load/parseAsteroidDiameters';
import { asteroidMeasuredSizeOf } from '../../../../src/layers/asteroids/catalog/utils/asteroidMeasuredSizeOf';

// Through the real writer and parser, so the byte layout is checked from both ends.
const DIAMETERS = parseAsteroidDiameters(
  writeAsteroidDiameters([
    { number: 2, diameterKm: 513, albedo: 0.155 },
    { number: 433, diameterKm: 16.84, albedo: 0.25 },
    { number: 2000, diameterKm: 0.85, albedo: null },
  ]).slice().buffer,
);

describe('asteroidMeasuredSizeOf', () => {
  it('finds each measured number, first, middle and last, with its own diameter and albedo', () => {
    expect(asteroidMeasuredSizeOf(DIAMETERS, 2)!.diameterKm).toBe(513);
    expect(asteroidMeasuredSizeOf(DIAMETERS, 433)!.diameterKm).toBeCloseTo(16.84, 5);
    expect(asteroidMeasuredSizeOf(DIAMETERS, 433)!.albedo).toBeCloseTo(0.25, 6);
    expect(asteroidMeasuredSizeOf(DIAMETERS, 2000)).toEqual({
      diameterKm: Math.fround(0.85),
      albedo: null,
    });
  });

  it('gives null for a number between, before or after the measured ones', () => {
    for (const number of [1, 3, 432, 434, 1999, 2001]) {
      expect(asteroidMeasuredSizeOf(DIAMETERS, number)).toBeNull();
    }
  });

  it('refuses an unsorted bake, which the binary search would misread', () => {
    expect(() =>
      writeAsteroidDiameters([
        { number: 5, diameterKm: 1, albedo: null },
        { number: 4, diameterKm: 1, albedo: null },
      ]),
    ).toThrow(/out of order/);
  });
});
