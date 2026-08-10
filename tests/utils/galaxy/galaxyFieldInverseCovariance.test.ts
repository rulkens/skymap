/**
 * galaxyFieldInverseCovariance — checks the hand-collapsed congruence
 * S^T*Q^T*D*Q*S against a generic 3x3 reference product.
 *
 * Coverage focus: the closed form drops every term that vanishes because M0's
 * y row and column are (0, d1, 0), which is exactly the kind of derivation a
 * sign slip survives silently — the shader would just render a subtly wrong
 * blob. The volume-preservation case guards the amplitude normalisation, which
 * assumes det(S) = 1 and applies no correction.
 */

import { describe, it, expect } from 'vitest';
import { galaxyFieldInverseCovariance } from '../../../src/utils/galaxy/galaxyFieldInverseCovariance';

type Mat3 = number[][];

function multiply(a: Mat3, b: Mat3): Mat3 {
  return [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => a[r]![0]! * b[0]![c]! + a[r]![1]! * b[1]![c]! + a[r]![2]! * b[2]![c]!),
  );
}

function transpose(a: Mat3): Mat3 {
  return [0, 1, 2].map((r) => [0, 1, 2].map((c) => a[c]![r]!));
}

/** The reference: world -> component rotation about +Y, then the warp shear. */
function reference(axes: {
  sigmaAlong: number;
  sigmaPole: number;
  sigmaAcross: number;
  tiltRad: number;
  shearX: number;
  shearZ: number;
}): Mat3 {
  const ct = Math.cos(axes.tiltRad);
  const st = Math.sin(axes.tiltRad);
  const q: Mat3 = [
    [ct, 0, st],
    [0, 1, 0],
    [-st, 0, ct],
  ];
  const d: Mat3 = [
    [1 / axes.sigmaAlong ** 2, 0, 0],
    [0, 1 / axes.sigmaPole ** 2, 0],
    [0, 0, 1 / axes.sigmaAcross ** 2],
  ];
  const s: Mat3 = [
    [1, 0, 0],
    [axes.shearX, 1, axes.shearZ],
    [0, 0, 1],
  ];
  return multiply(transpose(s), multiply(multiply(transpose(q), d), multiply(q, s)));
}

function determinant(m: Mat3): number {
  return (
    m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
    m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
    m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!)
  );
}

const SHEARED = {
  sigmaAlong: 2.5,
  sigmaPole: 0.4,
  sigmaAcross: 1.1,
  tiltRad: 0.47,
  shearX: 0.031,
  shearZ: -0.019,
};

describe('galaxyFieldInverseCovariance', () => {
  it('matches a generic S^T*M0*S product for a tilted, sheared component', () => {
    const { invCovDiagonal, invCovOffDiagonal } = galaxyFieldInverseCovariance(SHEARED);
    const m = reference(SHEARED);
    expect(invCovDiagonal[0]).toBeCloseTo(m[0]![0]!, 10);
    expect(invCovDiagonal[1]).toBeCloseTo(m[1]![1]!, 10);
    expect(invCovDiagonal[2]).toBeCloseTo(m[2]![2]!, 10);
    expect(invCovOffDiagonal[0]).toBeCloseTo(m[0]![1]!, 10);
    expect(invCovOffDiagonal[1]).toBeCloseTo(m[0]![2]!, 10);
    expect(invCovOffDiagonal[2]).toBeCloseTo(m[1]![2]!, 10);
  });

  it('leaves the Gaussian volume untouched, so the amplitude needs no shear correction', () => {
    const unsheared = { ...SHEARED, shearX: 0, shearZ: 0 };
    expect(determinant(reference(SHEARED))).toBeCloseTo(determinant(reference(unsheared)), 10);
  });
});
