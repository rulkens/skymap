import { expect } from 'vitest';

import { MESH_POS_SCALE_OFFSET } from '../../../src/data/mesh/meshBinaryFormat';

/** f32 has ~2⁻²³ relative precision; an absolute epsilon alone underestimates
 * rounding slack once a coordinate's magnitude climbs past a few units. */
const F32_EPSILON = 2 ** -23;

/** Decoded positions within half a quantisation step of `expected` (the step read
 * off the file), plus f32 rounding slack scaled to `expected`'s own magnitude. */
export function expectPositionNear(
  file: ArrayBuffer,
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
): void {
  const posScale = new DataView(file).getFloat32(MESH_POS_SCALE_OFFSET, true);
  expect(actual.length).toBe(expected.length);
  const magnitude = Math.max(...Array.from(expected, Math.abs));
  const slack = posScale / 2 + magnitude * F32_EPSILON;
  for (let i = 0; i < expected.length; i++) {
    expect(Math.abs(actual[i]! - expected[i]!)).toBeLessThanOrEqual(slack);
  }
}
