/**
 * Tests for sampleConicalSpiral — the ideal outward spiral the star-spiral build
 * snaps stars onto. These pin the load-bearing geometry a real bug could break:
 * the geometric (not linear) radius law, the endpoint radii, the winding count,
 * and the x-axis tilt that lifts the path out of the xy-plane.
 */

import { describe, expect, it } from 'vitest';
import { sampleConicalSpiral } from '../../../../tools/utils/animation/sampleConicalSpiral';

const norm = (v: readonly [number, number, number]) => Math.hypot(v[0], v[1], v[2]);

describe('sampleConicalSpiral', () => {
  it('hits the inner and outer radius exactly at the endpoints', () => {
    const pts = sampleConicalSpiral({ r0: 2, r1: 500, turns: 5, samples: 200, inclineRad: 0.3 });
    expect(norm(pts[0]!)).toBeCloseTo(2, 6);
    expect(norm(pts[pts.length - 1]!)).toBeCloseTo(500, 6);
  });

  it('grows the radius geometrically, so the midpoint is the geometric mean', () => {
    // Odd sample count puts a sample exactly at t=0.5; geometric growth makes its
    // radius sqrt(r0·r1), not the linear midpoint (r0+r1)/2. This is the test that
    // would fail if the radius law regressed to linear interpolation.
    const pts = sampleConicalSpiral({ r0: 1, r1: 400, turns: 7, samples: 201, inclineRad: 0 });
    const mid = norm(pts[100]!);
    expect(mid).toBeCloseTo(Math.sqrt(1 * 400), 4);
    expect(mid).not.toBeCloseTo((1 + 400) / 2, 1);
  });

  it('winds through `turns` full revolutions between the endpoints', () => {
    // Unrolling the flat-plane angle (atan2 of the pre-tilt xy) across all samples
    // must accumulate 2π·turns of total rotation.
    const turns = 6;
    const pts = sampleConicalSpiral({ r0: 1, r1: 100, turns, samples: 400, inclineRad: 0 });
    let total = 0;
    let prev = Math.atan2(pts[0]![1], pts[0]![0]);
    for (let i = 1; i < pts.length; i++) {
      const a = Math.atan2(pts[i]![1], pts[i]![0]);
      let d = a - prev;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      total += d;
      prev = a;
    }
    expect(Math.abs(total)).toBeCloseTo(2 * Math.PI * turns, 3);
  });

  it('tilts the plane about the x-axis so z tracks y·tan(incline)', () => {
    const inclineRad = 0.4;
    const pts = sampleConicalSpiral({ r0: 1, r1: 50, turns: 3, samples: 150, inclineRad });
    for (const p of pts) {
      // A z=0 flat point rotated about x gives y' = y·cos i, z' = y·sin i, so
      // z'/y' = tan i for every non-degenerate sample.
      if (Math.abs(p[1]) < 1e-9) continue;
      expect(p[2] / p[1]).toBeCloseTo(Math.tan(inclineRad), 6);
    }
  });

  it('places a single sample at the inner radius without dividing by zero span', () => {
    const [p] = sampleConicalSpiral({ r0: 3, r1: 400, turns: 5, samples: 1, inclineRad: 0.3 });
    expect(norm(p!)).toBeCloseTo(3, 6);
  });
});
