/**
 * orientationFlipCorrection — unit tests for the surface-fixed-follow basis
 * correction (spec §4.6): `inverse(orientationAtFlip) · currentOrientation`.
 *
 * The load-bearing property (equal inputs → identity) is why the mode's
 * engage frame introduces no pose jump — see `runFrame.test.ts` for the
 * end-to-end regression. Expected values here are independent of the
 * transpose-and-multiply implementation under test: `Rᵀ·R = I` is a
 * mathematical identity, and the same-axis composition is elementary trig
 * (angle subtraction), not a re-derivation of the source formula.
 */

import { describe, it, expect } from 'vitest';

import { orientationFlipCorrection } from '../../../src/utils/camera/orientationFlipCorrection';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import type { Mat3 } from '../../../src/@types/math/Mat3';

/** Exact (integer) 90°-about-local-Z tight Mat3 — no trig-call float noise. */
const ROT_90_Z: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];

const deg = (d: number): number => (d * Math.PI) / 180;

/** Independent rotation-about-Z builder — not the source's multiply. */
function rotZ(degrees: number): Mat3 {
  const c = Math.cos(deg(degrees));
  const s = Math.sin(deg(degrees));
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

describe('orientationFlipCorrection', () => {
  it('returns identity when both orientations are equal', () => {
    const result = orientationFlipCorrection(ROT_90_Z, ROT_90_Z);
    expect(result).toEqual(IDENTITY_MAT3);
  });

  it('with an identity orientationAtFlip, returns currentOrientation unchanged', () => {
    const result = orientationFlipCorrection(IDENTITY_MAT3, ROT_90_Z);
    expect(result).toEqual(ROT_90_Z);
  });

  it('composes two same-axis rotations by hand-computable angle subtraction', () => {
    const orientationAtFlip = rotZ(90);
    const currentOrientation = rotZ(150);
    const expected = rotZ(60); // 150° − 90°: same-axis rotations compose by angle addition.

    const result = orientationFlipCorrection(orientationAtFlip, currentOrientation);
    for (let i = 0; i < 9; i++) {
      expect(result[i]).toBeCloseTo(expected[i]!, 10);
    }
  });
});
