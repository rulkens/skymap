/**
 * resampleSkyToEquirect.test.ts — orientation and pole-coverage contract.
 *
 * The bug this exists to catch is a silently transposed or flipped sky: a map
 * baked with l and b swapped, or v running the wrong way, still produces a
 * plausible-looking image and only shows up as a rotated shell much later. So
 * the assertions pin WHERE a known direction lands, not merely that values came
 * out. The pole rows are the second trap — a longitude kernel that ignores
 * cos(b) leaves them unfilled, which reads as a hole in the surface.
 */
import { describe, expect, it } from 'vitest';

import { resampleSkyToEquirect } from '../../../../tools/utils/geo/resampleSkyToEquirect';

/** Samples on a coarse lattice. l and b ride through as two CHANNELS, so each
 * assertion reads the resampled direction directly instead of unpacking it. */
function lattice(stepDeg: number): { l: Float64Array; b: Float64Array } {
  const ls: number[] = [];
  const bs: number[] = [];
  for (let b = -90 + stepDeg / 2; b < 90; b += stepDeg) {
    for (let l = stepDeg / 2; l < 360; l += stepDeg) {
      ls.push(l);
      bs.push(b);
    }
  }
  return { l: Float64Array.from(ls), b: Float64Array.from(bs) };
}

describe('resampleSkyToEquirect', () => {
  it('puts b=+90 at the top row and b=-90 at the bottom', () => {
    const { l, b } = lattice(5);
    const [, bPlane] = resampleSkyToEquirect(l, b, [l, b], 72, 36);

    expect(bPlane![0]!).toBeGreaterThan(80);
    expect(bPlane![35 * 72]!).toBeLessThan(-80);
  });

  it('runs longitude left-to-right across the row', () => {
    const { l, b } = lattice(5);
    const [lPlane] = resampleSkyToEquirect(l, b, [l, b], 72, 36);

    const midRow = 18 * 72;
    expect(lPlane![midRow]!).toBeLessThan(20);
    expect(lPlane![midRow + 71]!).toBeGreaterThan(340);
  });

  it('fills every texel, including the pole rows', () => {
    const { l, b } = lattice(5);
    const [plane] = resampleSkyToEquirect(l, b, [b], 128, 64);

    expect(plane!.length).toBe(128 * 64);
    expect([...plane!].every((v) => Number.isFinite(v))).toBe(true);
  });

  it('carries every channel through the same nearest-sample choice', () => {
    const { l, b } = lattice(10);
    const second = l.map((v) => -v);
    const [a, bPlane] = resampleSkyToEquirect(l, b, [l, second], 36, 18);

    for (let i = 0; i < a!.length; i++) {
      expect(bPlane![i]).toBeCloseTo(-a![i]!, 5);
    }
  });

  it('rejects a channel whose length does not match the sample count', () => {
    const { l, b } = lattice(30);
    expect(() => resampleSkyToEquirect(l, b, [new Float64Array(3)], 8, 4)).toThrow(
      /does not match/,
    );
  });
});
