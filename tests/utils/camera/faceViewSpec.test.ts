/**
 * A cube face's view rotation must be a signed permutation of the capture
 * camera's axes — that property is what makes `deriveView`'s basis product
 * exact, so a face's vp carries no arithmetic of its own relative to the
 * capture's frame (`cubemapCaptureFrame` pins the resulting numbers).
 */

import { describe, it, expect } from 'vitest';

import { faceViewSpec } from '../../../src/utils/camera/faceViewSpec';
import type { CubeFace } from '../../../src/@types/rendering/CubeFace';

const FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

describe('faceViewSpec', () => {
  it.each(FACES)('face %i turns the capture camera by a signed permutation', (face) => {
    const { rotation } = faceViewSpec(face, 512, 0);
    // Column-major: cell (row r, column c) is rotation[c * 3 + r]. One ±1 per
    // row and per column, zeros elsewhere — so |cell| sums to 1 both ways.
    for (let i = 0; i < 9; i++) expect([0, 1]).toContain(Math.abs(rotation[i]!));
    for (let k = 0; k < 3; k++) {
      const sum = (cells: readonly number[]): number => cells.reduce((a, b) => a + b, 0);
      expect(sum([0, 1, 2].map((r) => Math.abs(rotation[k * 3 + r]!))), `column ${k}`).toBe(1);
      expect(sum([0, 1, 2].map((c) => Math.abs(rotation[c * 3 + k]!))), `row ${k}`).toBe(1);
    }
  });
});
