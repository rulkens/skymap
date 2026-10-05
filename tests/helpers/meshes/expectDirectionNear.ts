import { expect } from 'vitest';

/** The `.mesh` v3 bound on a 10-bit octahedral normal or tangent (spec "Tests"). */
const MAX_ANGLE_RAD = (0.3 * Math.PI) / 180;

/** A decoded normal (xyz) or tangent (xyzw): within 0.3°, unit length, handedness exact. */
export function expectDirectionNear(actual: ArrayLike<number>, expected: ArrayLike<number>): void {
  const [ax, ay, az] = [actual[0]!, actual[1]!, actual[2]!];
  const [ex, ey, ez] = [expected[0]!, expected[1]!, expected[2]!];
  const actualLength = Math.hypot(ax, ay, az);
  const cos = (ax * ex + ay * ey + az * ez) / (actualLength * Math.hypot(ex, ey, ez));
  expect(Math.acos(Math.min(1, cos))).toBeLessThanOrEqual(MAX_ANGLE_RAD);
  expect(Math.abs(actualLength - 1)).toBeLessThanOrEqual(1e-5);
  if (expected.length === 4) expect(actual[3]).toBe(expected[3]);
}
