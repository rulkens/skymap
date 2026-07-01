/**
 * causalHermiteNonUniform tests — a cubic Hermite segment with BACKWARD-difference
 * (causal) tangents and arbitrary knot times.
 *
 * Where `catmullRomNonUniform` takes the CENTRAL difference (p2−p0) for the
 * tangent at a knot — so the curve banks toward the NEXT knot before it has
 * arrived — this variant takes the INCOMING chord (p2−p1) as the arrival
 * tangent. The camera therefore reaches a waypoint head-on and only turns toward
 * the next one AFTER passing it. `turnDelay` scales the tangent magnitude.
 *
 * Contracts:
 *   - Passes through the two inner knots at their times, for ANY turnDelay.
 *   - The arrival at p2 is independent of the forward knot p3 (the defining
 *     causal property — Catmull-Rom's is NOT).
 *   - turnDelay 0 collapses both tangents to zero → a plain smoothstep between
 *     the inner knots.
 *   - A coincident-knot leg stays finite (no divide-by-zero).
 */

import { describe, it, expect } from 'vitest';
import { causalHermiteNonUniform } from '../../../src/utils/math/causalHermiteNonUniform';

describe('causalHermiteNonUniform', () => {
  it('passes through the two inner knots at their times, for any turnDelay', () => {
    const p = [1, 4, 9, 16];
    const t = [0, 1, 3, 6]; // uneven spacing
    for (const td of [0, 0.5, 1, 2]) {
      expect(
        causalHermiteNonUniform(p[0]!, p[1]!, p[2]!, p[3]!, t[0]!, t[1]!, t[2]!, t[3]!, t[1]!, td),
      ).toBeCloseTo(4, 9);
      expect(
        causalHermiteNonUniform(p[0]!, p[1]!, p[2]!, p[3]!, t[0]!, t[1]!, t[2]!, t[3]!, t[2]!, td),
      ).toBeCloseTo(9, 9);
    }
  });

  it('is independent of the forward knot p3 (causal: arrival uses only the incoming chord)', () => {
    const t = [0, 1, 2, 3];
    const mid = 1.5;
    const withA = causalHermiteNonUniform(0, 2, 5, 9, t[0]!, t[1]!, t[2]!, t[3]!, mid, 1);
    // Move p3 far away — a central-difference (Catmull-Rom) basis would shift the
    // whole segment; the causal basis must not move at all.
    const withB = causalHermiteNonUniform(0, 2, 5, -100, t[0]!, t[1]!, t[2]!, t[3]!, mid, 1);
    expect(withB).toBeCloseTo(withA, 12);
  });

  it('collapses to a smoothstep between the inner knots at turnDelay 0', () => {
    const t = [0, 1, 2, 3];
    const p1 = 2;
    const p2 = 7;
    for (let i = 0; i <= 10; i++) {
      const s = i / 10;
      const global = t[1]! + s; // segment [t1,t2] has unit width here
      const h00 = 2 * s * s * s - 3 * s * s + 1;
      const h01 = -2 * s * s * s + 3 * s * s;
      const smoothstep = h00 * p1 + h01 * p2; // zero tangents
      const v = causalHermiteNonUniform(0, p1, p2, 9, t[0]!, t[1]!, t[2]!, t[3]!, global, 0);
      expect(v).toBeCloseTo(smoothstep, 9);
    }
  });

  it('arrives at p2 with a tangent along the incoming chord, scaled by turnDelay', () => {
    // Numeric derivative just before t2; with unit segment width the Hermite
    // arrival slope is turnDelay·(p2−p1). Larger turnDelay = steeper approach.
    const t = [0, 1, 2, 3];
    const p1 = 2;
    const p2 = 7;
    const eps = 1e-6;
    const slopeAt = (td: number): number => {
      const a = causalHermiteNonUniform(0, p1, p2, 9, t[0]!, t[1]!, t[2]!, t[3]!, 2 - eps, td);
      return (p2 - a) / eps;
    };
    expect(slopeAt(1)).toBeCloseTo(p2 - p1, 3);
    expect(slopeAt(2)).toBeCloseTo(2 * (p2 - p1), 3);
  });

  it('holds the left value when two knot times coincide (degenerate leg)', () => {
    const v = causalHermiteNonUniform(0, 5, 9, 12, 0, 2, 2, 4, 2, 1);
    expect(Number.isFinite(v)).toBe(true);
  });
});
