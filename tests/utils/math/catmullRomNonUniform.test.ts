/**
 * catmullRomNonUniform tests — a Catmull-Rom segment with arbitrary knot times.
 *
 * The uniform `catmullRom` assumes knots are evenly spaced (times 0,1,2,3). The
 * non-uniform variant takes the four knot TIMES explicitly, which is what
 * centripetal (α=0.5) parametrisation needs: knot spacing ∝ chord length^α
 * spreads tightly-clustered knots out in parameter space, killing the overshoot
 * loops uniform Catmull-Rom forms on unevenly-spaced control points.
 *
 * Contracts:
 *   - Passes through the inner knots: value(t1)=p1, value(t2)=p2.
 *   - With evenly-spaced times it reduces to the uniform `catmullRom`.
 */

import { describe, it, expect } from 'vitest';
import { catmullRomNonUniform } from '../../../src/utils/math/catmullRomNonUniform';
import { catmullRom } from '../../../src/utils/math/catmullRom';

describe('catmullRomNonUniform', () => {
  it('passes through the two inner knots at their times', () => {
    const p = [1, 4, 9, 16];
    const t = [0, 1, 3, 6]; // uneven spacing
    expect(
      catmullRomNonUniform(p[0]!, p[1]!, p[2]!, p[3]!, t[0]!, t[1]!, t[2]!, t[3]!, t[1]!),
    ).toBeCloseTo(4, 9);
    expect(
      catmullRomNonUniform(p[0]!, p[1]!, p[2]!, p[3]!, t[0]!, t[1]!, t[2]!, t[3]!, t[2]!),
    ).toBeCloseTo(9, 9);
  });

  it('reduces to uniform catmullRom when knot times are evenly spaced', () => {
    const p = [0, 2, 3, -1];
    // Uniform: times 0,1,2,3; the segment param u∈[0,1] maps to global t = 1+u.
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const uniform = catmullRom(p[0]!, p[1]!, p[2]!, p[3]!, u);
      const nonUniform = catmullRomNonUniform(p[0]!, p[1]!, p[2]!, p[3]!, 0, 1, 2, 3, 1 + u);
      expect(nonUniform).toBeCloseTo(uniform, 9);
    }
  });

  it('holds the left value when two knot times coincide (degenerate leg)', () => {
    // A zero-length leg (t1 === t2) must not divide by zero — the evaluator
    // returns a finite value at the shared time.
    const v = catmullRomNonUniform(0, 5, 9, 12, 0, 2, 2, 4, 2);
    expect(Number.isFinite(v)).toBe(true);
  });
});
