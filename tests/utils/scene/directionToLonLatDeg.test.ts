/**
 * directionToLonLatDeg — the sub-camera geodetic readout's inverse-projection
 * half. What can actually break here is a swapped axis or a sign flip against
 * `equirectUvToDirection`'s convention (both encode `x = cosLat·cos(lon)`,
 * `y = cosLat·sin(lon)`, `z = sin(lat)`); a round-trip through that forward
 * mapping catches either.
 */
import { describe, it, expect } from 'vitest';

import { directionToLonLatDeg } from '../../../src/utils/scene/directionToLonLatDeg';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** The forward mapping `equirectUvToDirection` bakes into the tile grid,
 *  reimplemented from degrees so the round-trip doesn't share code with the
 *  function under test. */
function dirFromLonLatDeg(lonDeg: number, latDeg: number): Vec3 {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}

describe('directionToLonLatDeg', () => {
  it('round-trips a known lon/lat through the direction convention', () => {
    // Søndermarken, Copenhagen — the GeoDanmark demo band's neighbourhood.
    const point = directionToLonLatDeg(dirFromLonLatDeg(12.53, 55.67));
    expect(point.lonDeg).toBeCloseTo(12.53, 9);
    expect(point.latDeg).toBeCloseTo(55.67, 9);
  });

  it('reports the poles at +-90 latitude, longitude undefined but finite', () => {
    const north = directionToLonLatDeg([0, 0, 1]);
    expect(north.latDeg).toBeCloseTo(90, 9);
    expect(Number.isFinite(north.lonDeg)).toBe(true);
  });

  it('places the antimeridian at +-180, matching atan2 rather than wrapping to 0', () => {
    // Straight down the local -X axis: lon = atan2(0, -1) = pi, i.e. 180 deg.
    const point = directionToLonLatDeg([-1, 0, 0]);
    expect(Math.abs(point.lonDeg)).toBeCloseTo(180, 9);
    expect(point.latDeg).toBeCloseTo(0, 9);
  });

  it('east and west of the prime meridian carry opposite-sign longitude', () => {
    const east = directionToLonLatDeg(dirFromLonLatDeg(30, 0));
    const west = directionToLonLatDeg(dirFromLonLatDeg(-30, 0));
    expect(east.lonDeg).toBeCloseTo(30, 9);
    expect(west.lonDeg).toBeCloseTo(-30, 9);
  });
});
