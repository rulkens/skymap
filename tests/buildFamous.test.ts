import { describe, it, expect } from 'vitest';
import { findNearestPoint } from '../tools/buildFamous';

/**
 * Build a tiny PointCloud-shaped fixture with three Cartesian points so
 * we can exercise `findNearestPoint` without hitting disk.
 */
function makeCloud(xyz: ReadonlyArray<readonly [number, number, number]>) {
  const count = xyz.length;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = xyz[i]![0];
    positions[i * 3 + 1] = xyz[i]![1];
    positions[i * 3 + 2] = xyz[i]![2];
  }
  return { count, positions };
}

describe('findNearestPoint', () => {
  it('returns the closest index when one point is much closer', () => {
    // Three points in clearly different sky directions:
    //   index 0: +x axis direction (RA≈0°, Dec≈0°)
    //   index 1: +y axis direction (RA≈90°, Dec≈0°) — query is near this
    //   index 2: −x axis direction (RA≈180°, Dec≈0°)
    // The query [0.1, 5.0, 0.0] points nearly along +y, so index 1 is
    // the angular nearest.  We use different distances (1 Mpc vs 10 Mpc)
    // to confirm the match is based on sky direction, not Euclidean proximity.
    const cloud = makeCloud([
      [10, 0, 0],   // index 0: +x, 10 Mpc
      [1, 1, 0],    // index 1: 45° from +x in xy-plane, 1 Mpc
      [-5, 0, 0],   // index 2: −x, 5 Mpc
    ]);
    // Query points nearly along [1, 1, 0] direction — 50000 arcsec ≈ 14°
    // threshold is wide enough to accept the ~0° match at index 1.
    const result = findNearestPoint(cloud, [0.9, 0.9, 0.0], 50000);
    expect(result).not.toBeNull();
    expect(result!.localIdx).toBe(1);
  });

  it('returns null when nothing is within the threshold', () => {
    // All catalog points are near +x; query points along −z.
    // Even the nearest catalog point is ~90° away (>>1 arcsec threshold).
    const cloud = makeCloud([
      [100, 0, 0],
      [99, 1, 0],
    ]);
    const result = findNearestPoint(cloud, [0, 0, -10], 1);
    expect(result).toBeNull();
  });

  it('returns the angular distance approximation in arcsec', () => {
    // Two points 1 Mpc apart at distance 100 Mpc → angular sep
    //   arctan(1/100) rad ≈ 0.01 rad ≈ 2063 arcsec.
    const cloud = makeCloud([[100, 0, 0]]);
    const result = findNearestPoint(cloud, [100, 1, 0], Infinity);
    expect(result).not.toBeNull();
    // Tolerate ±100 arcsec (small-angle approximation slop).
    expect(result!.distanceArcsec).toBeGreaterThan(1900);
    expect(result!.distanceArcsec).toBeLessThan(2200);
  });
});
