import { describe, it, expect } from 'vitest';

import { encodeFramedPose } from '../../../src/utils/url/encodeFramedPose';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';
import type { BodyId } from '../../../src/@types/data/body/BodyId';

describe('encodeFramedPose', () => {
  it('serializes a body arm as the b-tagged, comma-joined form', () => {
    const arm: FramedCameraPose = {
      frame: { body: 'earth' },
      pose: {
        bodyId: 'earth',
        anchorLocalM: [1, 2, 3],
        eyeRelAnchorM: [4, 5, 6],
        basisLocal: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      },
    };
    expect(encodeFramedPose(arm)).toBe('b,earth,1,2,3,4,5,6,1,0,0,0,1,0,0,0,1');
  });

  it('serializes a site arm as the s-tagged form', () => {
    const site: FramedCameraPose = {
      frame: { site: 'curiosity' as BodyId },
      pose: { siteId: 'curiosity' as BodyId, headingRad: 1.2, elevationRad: 0.3, rangeM: 12.5 },
    };
    expect(encodeFramedPose(site)).toBe('s,curiosity,1.2,0.3,12.5');
  });

  it('serializes a world arm as the a-tagged form, defaulting an absent roll to 0', () => {
    const world: FramedCameraPose = {
      frame: 'absolute',
      pose: { target: [1, 2, 3], yaw: 0.7, pitch: -0.2, distance: 5.5 },
    };
    expect(encodeFramedPose(world)).toBe('a,1,2,3,0.7,-0.2,5.5,0');
  });

  it('carries a world arm’s explicit roll through', () => {
    const world: FramedCameraPose = {
      frame: 'absolute',
      pose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1, roll: 0.42 },
    };
    expect(encodeFramedPose(world)).toBe('a,0,0,0,0,0,1,0.42');
  });
});
