/**
 * frameUp tests — the reference up every camera-up consumer rolls about is the
 * orientation frame's north pole (`frameBasis`'s middle column), or world +Y
 * when no frame is active.
 *
 * The load-bearing assertion is the COMPOSITION with `imagePlaneBasis`: feeding
 * the equatorial frame's pole through the roll formula at roll 0 must produce a
 * camera up along world +z (the equatorial pole), proving the frame up — not the
 * hardcoded +y — is what reaches the lookAt / billboard basis. The absent-frame
 * case pins the identity fallback the pre-feature callers depend on.
 */

import { describe, it, expect } from 'vitest';
import { frameUp } from '../../../src/utils/camera/frameUp';
import { imagePlaneBasis } from '../../../src/utils/camera/imagePlaneBasis';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const near = (a: Vec3, b: Vec3) => {
  expect(a[0]).toBeCloseTo(b[0], 12);
  expect(a[1]).toBeCloseTo(b[1], 12);
  expect(a[2]).toBeCloseTo(b[2], 12);
};

describe('frameUp', () => {
  it('reads the equatorial frame pole (world +z) from the middle column', () => {
    near(frameUp(ORIENTATION_FRAMES.equatorial), [0, 0, 1]);
  });

  it('falls back to world +Y when no frame is active', () => {
    near(frameUp(undefined), [0, 1, 0]);
  });

  it('the camera up follows the frame pole through imagePlaneBasis', () => {
    // Look along +x so the pole (+z) is not parallel to forward; roll 0.
    const forward: Vec3 = [1, 0, 0];

    // Equatorial frame: the rolled-up (lookAt up) tracks the equatorial pole +z,
    // NOT world +y — this is the whole point of feeding frameUp instead of a
    // hardcoded [0,1,0].
    const framed = imagePlaneBasis(forward, 0, frameUp(ORIENTATION_FRAMES.equatorial));
    near(framed.rolledUp, [0, 0, 1]);
    near(framed.up, [0, 0, 1]);

    // No frame ⇒ identity ⇒ the pre-feature world-+y up is preserved.
    const identity = imagePlaneBasis(forward, 0, frameUp(undefined));
    near(identity.rolledUp, [0, 1, 0]);
    near(identity.up, [0, 1, 0]);
  });

  it('writes into a caller-owned out and returns it (no allocation)', () => {
    const out: Vec3 = [9, 9, 9];
    const ret = frameUp(ORIENTATION_FRAMES.equatorial, out);
    expect(ret).toBe(out);
    near(out, [0, 0, 1]);
  });
});
