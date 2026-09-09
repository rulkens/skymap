/**
 * resolveFrameBasis — unit tests for the per-frame resolved basis B(t).
 *
 * The resolver is pure over (orientation, frameTween, elapsedMs): the same
 * inputs yield the same Mat3, and elapsed is handed in, so no real wall-clock
 * is involved.
 *
 * 'linear' easing is used wherever the assertion needs a maths-clean parameter
 * (endpoints and orthonormality): with linear ease the slerp parameter equals
 * the raw time fraction, so the endpoint tests hit exactly 0 and 1.
 */

import { describe, it, expect } from 'vitest';
import { resolveFrameBasis } from '../../../../src/services/engine/camera/resolveFrameBasis';
import {
  ORIENTATION_FRAMES,
  ORIENTATION_FRAME_QUATERNIONS,
} from '../../../../src/data/orientation/orientationFrames';
import type { FrameTween } from '../../../../src/@types/camera/FrameTween';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

const TOL = 1e-6;

/** Assert two flat column-major Mat3 values agree per-cell within TOL. */
function expectMat3Close(actual: Mat3, expected: Mat3): void {
  for (let i = 0; i < 9; i++) {
    expect(actual[i]).toBeCloseTo(expected[i]!, 6);
  }
}

/** Column c (0,1,2) of a flat column-major Mat3 as a length-3 array. */
function col(m: Mat3, c: number): [number, number, number] {
  return [m[c * 3]!, m[c * 3 + 1]!, m[c * 3 + 2]!];
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

const equatorialToGalactic: FrameTween = {
  fromQuat: ORIENTATION_FRAME_QUATERNIONS.equatorial,
  to: 'galactic',
  durationMs: 600,
  easing: 'linear',
};

describe('resolveFrameBasis', () => {
  it('at elapsed 0 the basis equals the fromQuat basis', () => {
    // Elapsed 0 slerps at t=0 → the fromQuat (equatorial) basis.
    const basis = resolveFrameBasis('galactic', equatorialToGalactic, 0);
    expectMat3Close(basis, ORIENTATION_FRAMES.equatorial);
  });

  it('at elapsed >= durationMs the basis equals the destination frame', () => {
    // Past the duration: eased t clamps to 1 → destination (galactic).
    const basis = resolveFrameBasis('galactic', equatorialToGalactic, 700);
    expectMat3Close(basis, ORIENTATION_FRAMES.galactic);
  });

  it('every sampled midpoint basis is orthonormal', () => {
    // Linear easing → the slerp parameter equals each interior time fraction.
    for (const f of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const basis = resolveFrameBasis(
        'galactic',
        equatorialToGalactic,
        f * equatorialToGalactic.durationMs,
      );
      const c0 = col(basis, 0);
      const c1 = col(basis, 1);
      const c2 = col(basis, 2);
      // Unit-length columns.
      expect(Math.hypot(...c0)).toBeCloseTo(1, 6);
      expect(Math.hypot(...c1)).toBeCloseTo(1, 6);
      expect(Math.hypot(...c2)).toBeCloseTo(1, 6);
      // Mutually orthogonal columns.
      expect(Math.abs(dot(c0, c1))).toBeLessThan(TOL);
      expect(Math.abs(dot(c0, c2))).toBeLessThan(TOL);
      expect(Math.abs(dot(c1, c2))).toBeLessThan(TOL);
    }
  });

  it('a null frameTween returns the steady registry basis', () => {
    const basis = resolveFrameBasis('galactic', null, 0);
    expectMat3Close(basis, ORIENTATION_FRAMES.galactic);
  });
});
