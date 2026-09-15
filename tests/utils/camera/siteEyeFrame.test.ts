/**
 * siteEyeFrame — the ENU the whole site rung is expressed in. Hand-checked at
 * the equator (where east is +y under the east-positive IAU convention) and at
 * the pole (the degenerate branch, where the flattened pole vanishes).
 */

import { describe, it, expect } from 'vitest';

import { siteEyeFrame } from '../../../src/utils/camera/siteEyeFrame';
import { cross3 } from '../../../src/utils/math/cross3';
import { dot3 } from '../../../src/utils/math/dot3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

function expectOrthonormalRightHanded(p: Vec3): void {
  const { localUp, east, north } = siteEyeFrame(p);
  for (const v of [localUp, east, north]) expect(Math.hypot(...v)).toBeCloseTo(1, 12);
  expect(dot3(east, north)).toBeCloseTo(0, 12);
  expect(dot3(north, localUp)).toBeCloseTo(0, 12);
  expect(dot3(localUp, east)).toBeCloseTo(0, 12);
  // east × north = up is the handedness; a flipped east would keep every dot
  // product above at zero and silently mirror every heading.
  const handed = cross3(east, north);
  expect(handed[0]).toBeCloseTo(localUp[0], 12);
  expect(handed[1]).toBeCloseTo(localUp[1], 12);
  expect(handed[2]).toBeCloseTo(localUp[2], 12);
}

describe('siteEyeFrame', () => {
  it('east, north and up are orthonormal and right-handed at the equator', () => {
    expectOrthonormalRightHanded([3390000, 0, 0]);
    // On the prime meridian at the equator, east is +y and north is the pole.
    const { east, north } = siteEyeFrame([3390000, 0, 0]);
    expect(east[1]).toBeCloseTo(1, 12);
    expect(north[2]).toBeCloseTo(1, 12);
  });

  it('east, north and up are orthonormal and right-handed at a pole', () => {
    expectOrthonormalRightHanded([0, 0, 3390000]);
  });
});
