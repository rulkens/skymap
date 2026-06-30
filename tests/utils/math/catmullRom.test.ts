/**
 * catmullRom — unit tests for the uniform (centripetal-free) Catmull-Rom
 * scalar interpolant used as the geometry basis of `flyPath`.
 *
 * The spline interpolates the segment between `p1` and `p2`, using `p0` and `p3`
 * as the neighbouring control points that set the tangents. `t ∈ [0, 1]` runs
 * from `p1` (t=0) to `p2` (t=1). Splining each channel (target x/y/z, log
 * distance, yaw, pitch) component-wise through the waypoints gives a C1-smooth
 * path with no hand-authored tangents.
 */

import { describe, it, expect } from 'vitest';
import { catmullRom } from '../../../src/utils/math/catmullRom';

describe('catmullRom', () => {
  it('passes through p1 at t=0', () => {
    expect(catmullRom(0, 1, 2, 3, 0)).toBe(1);
  });

  it('passes through p2 at t=1', () => {
    expect(catmullRom(0, 1, 2, 3, 1)).toBe(2);
  });

  it('interpolates a collinear sequence linearly (midpoint = arithmetic mean)', () => {
    // p0..p3 evenly spaced → the spline is the straight line through them.
    expect(catmullRom(0, 1, 2, 3, 0.5)).toBeCloseTo(1.5, 12);
  });

  it('stays within the neighbour bounds for a smooth bump', () => {
    // A flat-then-rising bump: the midpoint must sit strictly between p1 and p2,
    // never overshooting (this is the property a flythrough relies on).
    const v = catmullRom(0, 0, 1, 1, 0.5);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });
});
