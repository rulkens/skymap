import { describe, expect, it } from 'vitest';
import { mat4d, vec3d } from 'wgpu-matrix';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { contractionMat4 } from '../../../src/utils/relativity/contractionMat4';

const SHIP: Vec3 = [3, -2, 5];
const DIR: Vec3 = [2 / 3, 1 / 3, -2 / 3];
const GAMMA = 4;

function apply(p: Readonly<Vec3>): Vec3 {
  const out = vec3d.transformMat4(p, contractionMat4(SHIP, DIR, GAMMA));
  return [out[0]!, out[1]!, out[2]!];
}

function expectClose(actual: Readonly<Vec3>, expected: Readonly<Vec3>): void {
  for (let i = 0; i < 3; i += 1) expect(actual[i]).toBeCloseTo(expected[i]!, 12);
}

describe('contractionMat4', () => {
  it('contractionMat4 is identity at gamma 1', () => {
    // `+ 0` folds the −0 entries the k = 0 products leave behind.
    expect(Array.from(contractionMat4(SHIP, DIR, 1), (v) => v + 0)).toEqual(
      Array.from(mat4d.identity()),
    );
  });

  it('contractionMat4 fixes the ship', () => {
    expectClose(apply(SHIP), SHIP);
  });

  it('contractionMat4 leaves a perpendicular offset', () => {
    const perp: Vec3 = [1 / 3, 2 / 3, 2 / 3]; // dot(perp, DIR) = 0
    const p: Vec3 = [SHIP[0] + 7 * perp[0], SHIP[1] + 7 * perp[1], SHIP[2] + 7 * perp[2]];
    expectClose(apply(p), p);
  });

  it('contractionMat4 scales an offset along dir by 1/gamma', () => {
    const p: Vec3 = [SHIP[0] + 8 * DIR[0], SHIP[1] + 8 * DIR[1], SHIP[2] + 8 * DIR[2]];
    const squashed: Vec3 = [SHIP[0] + 2 * DIR[0], SHIP[1] + 2 * DIR[1], SHIP[2] + 2 * DIR[2]];
    expectClose(apply(p), squashed);
  });
});
