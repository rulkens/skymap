/**
 * ismMapDustRingEdges — direct test. Every existing consumer
 * (sampleIsmMapDustCdf.test.ts) computes its expected bounds by calling this
 * SAME function, so a regression to arithmetic-mean edges would pass every
 * one of those tests too. This checks the geometric-mean formula against a
 * hand-computed example, plus the two structural invariants the module's own
 * header promises: adjacent rings share an edge, and the ring set tiles
 * [rMin, rMax] with no gap or overlap.
 */
import { describe, expect, it } from 'vitest';
import { ismMapDustRingEdges } from '../../../src/utils/galaxy/ismMapDustRingEdges';

// rMax/rMin = 16 over 4 steps (5 rings) puts the per-ring growth factor at
// 16^(1/4) = 2 exactly, so ring centres land on the clean sequence
// 1, 2, 4, 8, 16 -- easy to bisect by hand.
const RINGS = 5;
const R_MIN = 1;
const R_MAX = 16;

describe('ismMapDustRingEdges', () => {
  it('bisects a middle ring at the geometric mean of its neighbours', () => {
    // Ring 2's neighbours sit at centres 2 and 8 (ring 1 and ring 3); its own
    // centre is 4. Geometric mean: sqrt(2*4) = 2*sqrt(2), sqrt(4*8) = 4*sqrt(2).
    const { rInner, rOuter } = ismMapDustRingEdges(2, RINGS, R_MIN, R_MAX);
    expect(rInner).toBeCloseTo(2 * Math.SQRT2, 12);
    expect(rOuter).toBeCloseTo(4 * Math.SQRT2, 12);
  });

  it('an arithmetic-mean regression would fail the same case', () => {
    // Guards the CHOICE of mean, not just the arithmetic: an arithmetic
    // bisection of centres 2 and 4 would land at 3, not 2*sqrt(2) ~= 2.828.
    const { rInner } = ismMapDustRingEdges(2, RINGS, R_MIN, R_MAX);
    expect(rInner).not.toBeCloseTo(3, 6);
  });

  it('adjacent rings share an edge -- no gap, no overlap', () => {
    for (let ring = 0; ring < RINGS - 1; ring++) {
      const a = ismMapDustRingEdges(ring, RINGS, R_MIN, R_MAX);
      const b = ismMapDustRingEdges(ring + 1, RINGS, R_MIN, R_MAX);
      expect(a.rOuter).toBe(b.rInner);
    }
  });

  it('tiles the full [rMin, rMax] domain exactly at the edge rings', () => {
    expect(ismMapDustRingEdges(0, RINGS, R_MIN, R_MAX).rInner).toBe(R_MIN);
    expect(ismMapDustRingEdges(RINGS - 1, RINGS, R_MIN, R_MAX).rOuter).toBe(R_MAX);
  });
});
