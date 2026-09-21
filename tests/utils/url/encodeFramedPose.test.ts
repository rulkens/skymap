import { describe, it, expect } from 'vitest';

import { encodeFramedPose } from '../../../src/utils/url/encodeFramedPose';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';
import type { BodyId } from '../../../src/@types/data/body/BodyId';

// The Everest body arm from a real `l`-key dump (earth-everest.json).
const EVEREST_ARM: FramedCameraPose = {
  frame: { body: 'earth' },
  pose: {
    bodyId: 'earth',
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [316016.6033591605, 5626973.168880969, 2985072.170314569],
    basisLocal: [
      -0.9985872887863048, 0.05276735314422709, 0.006247648883378639, 0.04057759866030342,
      0.6813767450970997, 0.7308072178952844, -0.03430575988636451, -0.7300283129324743,
      0.6825553290068026,
    ],
  },
};

describe('encodeFramedPose', () => {
  it('serializes a body arm as the b-tagged, comma-joined form', () => {
    expect(encodeFramedPose(EVEREST_ARM)).toBe(
      [
        'b',
        'earth',
        0,
        0,
        0,
        316016.6033591605,
        5626973.168880969,
        2985072.170314569,
        -0.9985872887863048,
        0.05276735314422709,
        0.006247648883378639,
        0.04057759866030342,
        0.6813767450970997,
        0.7308072178952844,
        -0.03430575988636451,
        -0.7300283129324743,
        0.6825553290068026,
      ].join(','),
    );
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
