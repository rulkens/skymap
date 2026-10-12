import { describe, expect, it } from 'vitest';

import type { BodyId } from '../../../src/@types/data/body/BodyId';
import { turnCameraArm } from '../../../tools/site/utils/turnCameraArm';

const ROVER = 'perseverance' as BodyId;

describe('turnCameraArm', () => {
  it('turns a world pose by its yaw and a site pose by its heading, and leaves the rest alone', () => {
    const world = turnCameraArm(
      { frame: 'absolute', pose: { target: [1, 2, 3], yaw: 0.5, pitch: 0.2, distance: 4 } },
      1,
    );
    expect(world).toEqual({
      frame: 'absolute',
      pose: { target: [1, 2, 3], yaw: 1.5, pitch: 0.2, distance: 4 },
    });

    const site = turnCameraArm(
      {
        frame: { site: ROVER },
        pose: { siteId: ROVER, headingRad: 0.5, elevationRad: 0.3, rangeM: 9 },
      },
      1,
    );
    expect(site).toEqual({
      frame: { site: ROVER },
      pose: { siteId: ROVER, headingRad: 1.5, elevationRad: 0.3, rangeM: 9 },
    });
  });
});
