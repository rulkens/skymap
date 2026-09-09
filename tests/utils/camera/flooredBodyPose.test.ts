import { describe, it, expect } from 'vitest';

import { flooredBodyPose } from '../../../src/utils/camera/flooredBodyPose';
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
    const pose: BodyFixedPose = {
      bodyId: 'earth',
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [0.1, 0, 0],
      basisLocal: IDENTITY,
    };
    const out = flooredBodyPose(pose, 1);
    expect(Math.hypot(...out.eyeRelAnchorM)).toBeGreaterThan(0.1);
  });
});
