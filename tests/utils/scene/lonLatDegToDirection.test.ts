/**
 * lonLatDegToDirection — the fly-to instrument's forward-projection half.
 * What can actually break here is a swapped axis or a sign flip against
 * `directionToLonLatDeg`'s convention; round-tripping through that inverse
 * catches either, for a spread of coordinates including the patch centre
 * `flyToLonLat` exists to hit and the pole singularities lon/lat's atan2
 * degrades near.
 */
import { describe, it, expect } from 'vitest';

import { lonLatDegToDirection } from '../../../src/utils/scene/lonLatDegToDirection';
import { directionToLonLatDeg } from '../../../src/utils/scene/directionToLonLatDeg';

describe('lonLatDegToDirection', () => {
  it('round-trips through directionToLonLatDeg for a spread of coordinates', () => {
    const points = [
      { lonDeg: 12.53, latDeg: 55.67 }, // GeoDanmark demo patch centre
      { lonDeg: 0, latDeg: 0 }, // prime meridian / equator
      { lonDeg: 180, latDeg: 0 }, // antimeridian
      { lonDeg: -180, latDeg: 0 },
      { lonDeg: 90, latDeg: 0 },
      { lonDeg: -90, latDeg: 0 },
      { lonDeg: 45, latDeg: 89.9 }, // near north pole
      { lonDeg: -120, latDeg: -89.9 }, // near south pole
      { lonDeg: -73.97, latDeg: 40.78 }, // New York
      { lonDeg: 151.21, latDeg: -33.87 }, // Sydney
    ];

    for (const point of points) {
      const dir = lonLatDegToDirection(point);
      const roundTripped = directionToLonLatDeg(dir);
      expect(roundTripped.lonDeg).toBeCloseTo(point.lonDeg, 9);
      expect(roundTripped.latDeg).toBeCloseTo(point.latDeg, 9);
    }
  });

  it('returns a unit vector', () => {
    const dir = lonLatDegToDirection({ lonDeg: 12.53, latDeg: 55.67 });
    const mag = Math.hypot(dir[0], dir[1], dir[2]);
    expect(mag).toBeCloseTo(1, 12);
  });
});
