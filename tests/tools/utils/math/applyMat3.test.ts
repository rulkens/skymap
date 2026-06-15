import { describe, it, expect } from 'vitest';
import { applyMat3 } from '../../../../tools/utils/math/applyMat3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

describe('applyMat3', () => {
  const identity: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  it('with identity returns the input vector', () => {
    expect(applyMat3(identity, [3, 4, 5])).toEqual([3, 4, 5]);
  });

  it('performs a 90° rotation about Z', () => {
    // Column-major 90° rotation about +Z: x → y, y → -x, z → z.
    // Columns: [0,1,0], [-1,0,0], [0,0,1].
    const rotZ90: Mat3 = [0, 1, 0, -1, 0, 0, 0, 0, 1];
    expect(applyMat3(rotZ90, [1, 0, 0])).toEqual([0, 1, 0]);
    expect(applyMat3(rotZ90, [0, 1, 0])).toEqual([-1, 0, 0]);
  });
});
