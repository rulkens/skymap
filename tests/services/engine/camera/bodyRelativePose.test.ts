/**
 * bodyRelativePose — provider A precision + rotation tests.
 *
 * Round-trip: undoing the world → body conversion by hand (rotate forward by
 * `orientation`, scale to Mpc, add `positionMpc`) must land back on `camPosMpc`
 * — the arithmetic spec §5 prescribes, at three very different offset scales.
 *
 * ULP floor: perturbing `camPosMpc` by one f64 ULP at ~1 AU magnitude must
 * still move `eyeRelBodyM`, and by well under the spec-§5 claimed floor —
 * this only holds if the subtraction happens in Mpc BEFORE the metre scale.
 *
 * Basis: `basisM` must stay orthonormal under rotation, and pass `camBasisWorld`
 * through unchanged under the identity orientation.
 */

import { describe, it, expect } from 'vitest';

import { bodyRelativePose } from '../../../../src/services/engine/camera/bodyRelativePose';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { multiply3x3 } from '../../../../src/utils/math/multiply3x3';
import { rotXMat3 } from '../../../../src/utils/math/rotXMat3';
import { rotYMat3 } from '../../../../src/utils/math/rotYMat3';
import { mat3FromColumns } from '../../../../src/utils/math/mat3FromColumns';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { BodyState } from '../../../../src/@types/scene/BodyState';

// A real (non-identity) rotation: composing two axis rotations exercises every
// matrix element, unlike a single-axis rotation which leaves a row/column at 0/1.
const NON_IDENTITY_ORIENTATION: Mat3 = multiply3x3(rotYMat3(0.6), rotXMat3(0.35));

// A local mutable identity — the shared IDENTITY_MAT3 is `Readonly<Mat3>`,
// which a readonly tuple type can't widen back to the mutable `Mat3` these
// call sites need.
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const CAM_BASIS: Mat3 = IDENTITY;

function makeBodyState(positionMpc: Vec3, orientation: Mat3): BodyState {
  return { positionMpc, orientation, meanAnomalyRad: 0 };
}

// One f64 ULP above x (x > 0) via raw bit-pattern increment.
function nextUlpUp(x: number): number {
  const buf = new ArrayBuffer(8);
  const f64 = new Float64Array(buf);
  const u64 = new BigUint64Array(buf);
  f64[0] = x;
  u64[0] = u64[0]! + 1n;
  return f64[0]!;
}

describe('bodyRelativePose', () => {
  it('round-trips world → body → world at Earth', () => {
    // camPosMpc = a heliocentric position (~1 AU) plus a small offset in an
    // arbitrary direction — one case per named offset scale.
    const positionMpc: Vec3 = [SCALE_UNITS.AU_TO_MPC, 0, 0];
    const bodyState = makeBodyState(positionMpc, NON_IDENTITY_ORIENTATION);
    const dir: Vec3 = [1 / 3, 2 / 3, -2 / 3]; // unit vector

    const offsetsKm = {
      'Earth-radius': 6371,
      'Jupiter-radius': 71_492,
      'Io-orbit': 421_700,
    };

    for (const [label, offsetKm] of Object.entries(offsetsKm)) {
      const offsetMpc = offsetKm * SCALE_UNITS.KM_TO_MPC;
      const camPosMpc: Vec3 = [
        positionMpc[0] + dir[0] * offsetMpc,
        positionMpc[1] + dir[1] * offsetMpc,
        positionMpc[2] + dir[2] * offsetMpc,
      ];

      const { eyeRelBodyM } = bodyRelativePose({
        bodyId: 'earth',
        camPosMpc,
        camBasisWorld: CAM_BASIS,
        bodyState,
      });

      // Undo by hand: rotate FORWARD by orientation (the inverse of the
      // transpose bodyRelativePose applies), scale to Mpc, add positionMpc back.
      const worldDeltaM = rotateVec3ByTightMat3(eyeRelBodyM, NON_IDENTITY_ORIENTATION);
      const reconstructed: Vec3 = [
        worldDeltaM[0] * SCALE_UNITS.M_TO_MPC + positionMpc[0],
        worldDeltaM[1] * SCALE_UNITS.M_TO_MPC + positionMpc[1],
        worldDeltaM[2] * SCALE_UNITS.M_TO_MPC + positionMpc[2],
      ];

      for (let i = 0; i < 3; i++) {
        expect(
          Math.abs(reconstructed[i]! - camPosMpc[i]!),
          `${label}, component ${i}`,
        ).toBeLessThan(1e-9);
      }
    }
  });

  it('resolves ~14 µm at Earth-radius magnitude', () => {
    // Body at ~1 AU; camera on its surface (an Earth-radius-scale offset) along
    // +X, so camPosMpc's own magnitude (~1 AU) — not the small offset — sets the
    // ULP that limits eyeRelBodyM's resolution.
    const positionMpc: Vec3 = [SCALE_UNITS.AU_TO_MPC, 0, 0];
    const bodyState = makeBodyState(positionMpc, IDENTITY);
    const surfaceOffsetMpc = 6371 * SCALE_UNITS.KM_TO_MPC;
    const camX = positionMpc[0] + surfaceOffsetMpc;
    const camPosMpc: Vec3 = [camX, 0, 0];
    const camPosMpcPerturbed: Vec3 = [nextUlpUp(camX), 0, 0];

    const before = bodyRelativePose({
      bodyId: 'earth',
      camPosMpc,
      camBasisWorld: CAM_BASIS,
      bodyState,
    });
    const after = bodyRelativePose({
      bodyId: 'earth',
      camPosMpc: camPosMpcPerturbed,
      camBasisWorld: CAM_BASIS,
      bodyState,
    });

    const deltaM = Math.abs(after.eyeRelBodyM[0] - before.eyeRelBodyM[0]);
    expect(deltaM).toBeGreaterThan(0);
    expect(deltaM).toBeLessThan(1e-4);
  });

  it('rotates the camera basis into the body frame', () => {
    // A camera basis that is NOT axis-aligned with the orientation, so a wrong
    // transpose direction would visibly fail orthonormality or the identity check.
    const camBasisWorld: Mat3 = mat3FromColumns([1, 0, 0], [0, 1, 0], [0, 0, 1]);
    const bodyState = makeBodyState([0, 0, 0], NON_IDENTITY_ORIENTATION);

    const { basisM } = bodyRelativePose({
      bodyId: 'earth',
      camPosMpc: [0, 0, 0],
      camBasisWorld,
      bodyState,
    });

    const col = (m: Mat3, c: 0 | 1 | 2): Vec3 => [m[c * 3]!, m[c * 3 + 1]!, m[c * 3 + 2]!];
    const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cols = [col(basisM, 0), col(basisM, 1), col(basisM, 2)];

    for (const c of cols) {
      expect(Math.abs(dot(c, c) - 1)).toBeLessThan(1e-12);
    }
    expect(Math.abs(dot(cols[0]!, cols[1]!))).toBeLessThan(1e-12);
    expect(Math.abs(dot(cols[0]!, cols[2]!))).toBeLessThan(1e-12);
    expect(Math.abs(dot(cols[1]!, cols[2]!))).toBeLessThan(1e-12);

    // Under the identity orientation, basisM must equal camBasisWorld exactly.
    const identityBodyState = makeBodyState([0, 0, 0], IDENTITY);
    const { basisM: basisUnderIdentity } = bodyRelativePose({
      bodyId: 'earth',
      camPosMpc: [0, 0, 0],
      camBasisWorld,
      bodyState: identityBodyState,
    });
    expect(basisUnderIdentity).toEqual(camBasisWorld);
  });
});
