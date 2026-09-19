import { expect } from 'vitest';

import { MESH_POS_SCALE_OFFSET } from '../../../src/data/mesh/meshBinaryFormat';

/** Decoded positions within half a quantisation step of `expected`, the step read off the file. */
export function expectPositionNear(
  file: ArrayBuffer,
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
): void {
  const posScale = new DataView(file).getFloat32(MESH_POS_SCALE_OFFSET, true);
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(Math.abs(actual[i]! - expected[i]!)).toBeLessThanOrEqual(posScale / 2 + 1e-6);
  }
}
