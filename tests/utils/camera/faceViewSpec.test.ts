/**
 * A cube face's view rotation must be a signed permutation of the capture
 * camera's axes — that property is what makes `deriveView`'s basis product
 * exact, so a face's vp carries no arithmetic of its own relative to the
 * capture's frame (`cubemapCaptureFrame` pins the resulting numbers).
 */

import { describe, it, expect } from 'vitest';

import { faceViewSpec } from '../../../src/utils/camera/faceViewSpec';
import { cameraBasisWorld } from '../../../src/utils/camera/cameraBasisWorld';
import { multiply3x3 } from '../../../src/utils/math/multiply3x3';
import { cross3 } from '../../../src/utils/math/cross3';
import { IDENTITY_MAT3 } from '../../../src/utils/math/identityMat3';
import type { CubeFace } from '../../../src/@types/rendering/CubeFace';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

describe('faceViewSpec', () => {
  it.each(FACES)('face %i turns the capture camera by a signed permutation', (face) => {
    const { rotation } = faceViewSpec('probe', face, 512, 0);
    // Column-major: cell (row r, column c) is rotation[c * 3 + r]. One ±1 per
    // row and per column, zeros elsewhere — so |cell| sums to 1 both ways.
    for (let i = 0; i < 9; i++) expect([0, 1]).toContain(Math.abs(rotation[i]!));
    for (let k = 0; k < 3; k++) {
      const sum = (cells: readonly number[]): number => cells.reduce((a, b) => a + b, 0);
      expect(sum([0, 1, 2].map((r) => Math.abs(rotation[k * 3 + r]!))), `column ${k}`).toBe(1);
      expect(sum([0, 1, 2].map((c) => Math.abs(rotation[c * 3 + k]!))), `row ${k}`).toBe(1);
    }
  });

  // The GL/WebGPU `texture_cube` sampling convention (table 8.19), stated
  // independently of `cubeFaceBases.ts`'s table — the binding under test —
  // so a shared bug in both can't hide from this.
  const FACE_FORWARD: readonly Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  const FACE_UP: readonly Vec3[] = [
    [0, -1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0, -1, 0],
    [0, -1, 0],
  ];

  it.each(FACES)(
    "face %i's rotation, applied to the capture camera's own basis, IS that face's world basis",
    (face) => {
      // The capture camera under identity `axes` (`cubemapCaptureFrame`'s
      // convention `FACE_VIEW_ROTATIONS` is defined relative to): looking
      // along world −Z with +Y up. This test is the binding between that
      // convention and `faceViewSpec`'s table — the two must never drift
      // apart.
      const captureBasis = cameraBasisWorld([0, 0, -1], 0, IDENTITY_MAT3);
      const worldBasis = multiply3x3(captureBasis, faceViewSpec('probe', face, 1, 0).rotation);
      const right: Vec3 = [worldBasis[0]!, worldBasis[1]!, worldBasis[2]!];
      const up: Vec3 = [worldBasis[3]!, worldBasis[4]!, worldBasis[5]!];
      const forward: Vec3 = [worldBasis[6]!, worldBasis[7]!, worldBasis[8]!];
      const expectClose = (got: Readonly<Vec3>, want: Readonly<Vec3>): void => {
        for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(want[i]!, 12);
      };
      expectClose(forward, FACE_FORWARD[face]!);
      expectClose(up, FACE_UP[face]!);
      expectClose(right, cross3(FACE_FORWARD[face]!, FACE_UP[face]!));
    },
  );
});
