/**
 * orientationWorldDelta — unit tests for the surface-fixed-follow WORLD-space
 * basis correction (spec §4.6): `currentOrientation · inverse(orientationAtEngage)`.
 *
 * The load-bearing property (equal inputs → identity) is why the mode's
 * engage frame introduces no pose jump — see `runFrame.test.ts` for the
 * end-to-end regression, and its dedicated Moon-pole test for the
 * non-degenerate-axis regression an identity/same-axis fixture structurally
 * cannot catch (a `b·aᵀ` vs `aᵀ·b` order bug is invisible when `a`, `b` share
 * an axis with world Z — see `orientationWorldDelta.ts`'s docblock). Expected
 * values here are independent of the transpose-and-multiply implementation
 * under test: `R·Rᵀ = I` is a mathematical identity, and the same-axis
 * composition is elementary trig (angle subtraction), not a re-derivation of
 * the source formula.
 */

import { describe, it, expect } from 'vitest';

import { orientationWorldDelta } from '../../../src/utils/camera/orientationWorldDelta';
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

describe('orientationWorldDelta', () => {
  it('returns identity when both orientations are equal', () => {
    const result = orientationWorldDelta(ROT_90_Z, ROT_90_Z);
    expect(result).toEqual(IDENTITY_MAT3);
  });

  it('with an identity orientationAtEngage, returns currentOrientation unchanged', () => {
    const result = orientationWorldDelta(IDENTITY_MAT3, ROT_90_Z);
    expect(result).toEqual(ROT_90_Z);
  });

  it('composes two same-axis rotations by hand-computable angle subtraction', () => {
    const orientationAtEngage = rotZ(90);
    const currentOrientation = rotZ(150);
    const expected = rotZ(60); // 150° − 90°: same-axis rotations compose by angle subtraction.

    const result = orientationWorldDelta(orientationAtEngage, currentOrientation);
    for (let i = 0; i < 9; i++) {
      expect(result[i]).toBeCloseTo(expected[i]!, 10);
    }
  });
});
