import { describe, it, expect } from 'vitest';

import { framingPose } from '../../../../src/services/engine/camera/framingPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

describe('framingPose', () => {
  it('drops the roll of from: a focus lands level', () => {
    const from = { target: [9, 9, 9] as Vec3, yaw: 0.4, pitch: -0.2, distance: 500, roll: 0.3 };
    const pose = framingPose({ type: 'milkyWay' }, 0.8, from);
    expect(pose.roll).toBeUndefined();
  });
});
