import { describe, it, expect } from 'vitest';

import { bodyFixedEyeM } from '../../../src/utils/camera/bodyFixedEyeM';
import { flooredBodyPose } from '../../../src/utils/camera/flooredBodyPose';
import { surfaceFloorM } from '../../../src/utils/camera/surfaceFloorM';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('flooredBodyPose', () => {
  it('leaves an eye exactly at the centre alone rather than dividing by zero', () => {
    // The push direction is undefined at the centre; the guard against
    // `scale = floorM / 0` is what keeps this NaN-free rather than merely
    // "usually works".
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0, 0, 0],
      basisLocal: IDENTITY,
    };
    const out = flooredBodyPose(pose, 1);
    expect(out).toBe(pose);
  });

  it('pushes an eye below the floor out to the floor radius', () => {
    // Anchored on the surface, eye below the floor relative to it: the floor is
    // on |anchor + eyeRelAnchor|, so an implementation flooring `eyeRelAnchorM`
    // alone would push the eye to 2.4e-6 of the centre here instead.
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 1],
      eyeRelAnchorM: [0, 0, -0.5],
      basisLocal: IDENTITY,
    };
    const out = flooredBodyPose(pose, 1);
    // Exactly the floor radius, not merely "further out": a push that
    // overshoots or undershoots is the bug this guards.
    expect(Math.hypot(...bodyFixedEyeM(out))).toBeCloseTo(surfaceFloorM(1), 12);
  });
});
