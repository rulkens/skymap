/**
 * Tests for sampleConicalSpiral — the ideal outward spiral the star-spiral build
 * snaps stars onto. These pin the load-bearing geometry a real bug could break:
 * the geometric (not linear) radius law, the endpoint radii, the winding count,
 * the x-axis tilt that lifts the path out of the xy-plane, and the arc-length-
 * uniform sampling that makes the visit cadence scale-free.
 */

import { describe, expect, it } from 'vitest';
import { sampleConicalSpiral } from '../../../../tools/utils/animation/sampleConicalSpiral';

const norm = (v: readonly [number, number, number]) => Math.hypot(v[0], v[1], v[2]);
const dist = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('sampleConicalSpiral', () => {
  it('hits the inner and outer radius exactly at the endpoints', () => {
    const pts = sampleConicalSpiral({ r0: 2, r1: 500, turns: 5, spacingPc: 5, inclineRad: 0.3 });
    expect(norm(pts[0]!)).toBeCloseTo(2, 6);
    expect(norm(pts[pts.length - 1]!)).toBeCloseTo(500, 6);
  });

  it('spaces consecutive samples equidistant along the true arc length', () => {
    // The defining property of the rebake: equal PARSECS of path between every
    // consecutive pair, not equal steps of the curve parameter. Verified against an
    // INDEPENDENT integrator — recover each sample's parameter t from its radius,
    // then fine-integrate the parametric curve between successive t's — so a
    // regression to t-uniform sampling (which would make the inner arc steps
    // collapse and the outer ones blow up) fails the equal-increment assertion.
    const r0 = 1;
    const r1 = 400;
    const turns = 7;
    const inclineRad = 0.3;
    const pts = sampleConicalSpiral({ r0, r1, turns, spacingPc: 8, inclineRad });

    const ratio = r1 / r0;
    const w = 2 * Math.PI * turns;
    const cosI = Math.cos(inclineRad);
    const sinI = Math.sin(inclineRad);
    const point = (t: number): [number, number, number] => {
      const r = r0 * ratio ** t;
      const th = w * t;
      const yf = r * Math.sin(th);
      return [r * Math.cos(th), yf * cosI, yf * sinI];
    };
    // Fine arc length between two parameter values by summing many chords.
    const arcBetween = (ta: number, tb: number): number => {
      const STEPS = 400;
      let s = 0;
      let prev = point(ta);
      for (let j = 1; j <= STEPS; j++) {
        const p = point(ta + ((tb - ta) * j) / STEPS);
        s += dist(p, prev);
        prev = p;
      }
      return s;
    };
    const tOf = (p: readonly [number, number, number]) => Math.log(norm(p) / r0) / Math.log(ratio);

    const arcs: number[] = [];
    for (let i = 1; i < pts.length; i++) arcs.push(arcBetween(tOf(pts[i - 1]!), tOf(pts[i]!)));
    const min = Math.min(...arcs);
    const max = Math.max(...arcs);
    expect(max / min).toBeLessThan(1.001); // all arc steps essentially equal
    expect(min).toBeGreaterThan(8 * 0.99);
    expect(max).toBeLessThan(8 * 1.01);
  });

  it('derives the sample count from arc length ÷ spacing', () => {
    // Halving the spacing roughly doubles the number of samples — the count is a
    // consequence of the requested cadence, not an input.
    const coarse = sampleConicalSpiral({ r0: 1, r1: 400, turns: 7, spacingPc: 16, inclineRad: 0.3 });
    const fine = sampleConicalSpiral({ r0: 1, r1: 400, turns: 7, spacingPc: 8, inclineRad: 0.3 });
    expect(fine.length).toBeGreaterThan(coarse.length * 1.8);
    expect(fine.length).toBeLessThan(coarse.length * 2.2);
  });

  it('grows the radius geometrically, so the angle follows the log-radius law', () => {
    // Arc-uniform sampling makes the sample RADII come out linearly spaced; the
    // geometric law lives in the ANGLE. At each sample the plane angle must equal
    // w·ln(r/r0)/ln(ratio) modulo a full turn. A regression of the radius law to
    // linear interpolation would give the wrong angle-vs-radius mapping and fail
    // here. (Compared modulo 2π rather than unrolled: the inner turns take angle
    // steps larger than π, which no atan2-delta unrolling can track.)
    const r0 = 1;
    const r1 = 400;
    const turns = 7;
    const pts = sampleConicalSpiral({ r0, r1, turns, spacingPc: 6, inclineRad: 0 });
    const w = 2 * Math.PI * turns;
    const k = Math.log(r1 / r0);
    for (let i = 1; i < pts.length; i++) {
      const r = norm(pts[i]!);
      const measured = Math.atan2(pts[i]![1], pts[i]![0]);
      const expected = w * (Math.log(r / r0) / k);
      let diff = measured - expected;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // wrap to (-π, π]
      expect(Math.abs(diff)).toBeLessThan(1e-6);
    }
  });

  it('winds through `turns` full revolutions between the endpoints', () => {
    // Unrolling the flat-plane angle (atan2 of the pre-tilt xy) across all samples
    // must accumulate 2π·turns of total rotation.
    const turns = 6;
    const pts = sampleConicalSpiral({ r0: 1, r1: 100, turns, spacingPc: 2, inclineRad: 0 });
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
    expect(Math.abs(total)).toBeCloseTo(2 * Math.PI * turns, 2);
  });

  it('tilts the plane about the x-axis so z tracks y·tan(incline)', () => {
    const inclineRad = 0.4;
    const pts = sampleConicalSpiral({ r0: 1, r1: 50, turns: 3, spacingPc: 1, inclineRad });
    for (const p of pts) {
      // A z=0 flat point rotated about x gives y' = y·cos i, z' = y·sin i, so
      // z'/y' = tan i for every non-degenerate sample.
      if (Math.abs(p[1]) < 1e-9) continue;
      expect(p[2] / p[1]).toBeCloseTo(Math.tan(inclineRad), 6);
    }
  });
});
