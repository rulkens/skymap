import { describe, it, expect } from 'vitest';

import { decodeFramedPose } from '../../../src/utils/url/decodeFramedPose';
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

const SITE_ARM: FramedCameraPose = {
  frame: { site: 'curiosity' as BodyId },
  pose: { siteId: 'curiosity' as BodyId, headingRad: 1.2, elevationRad: 0.3, rangeM: 12.5 },
};

const WORLD_ARM: FramedCameraPose = {
  frame: 'absolute',
  pose: { target: [1, 2, 3], yaw: 0.7, pitch: -0.2, distance: 5.5, roll: 0.42 },
};

describe('decodeFramedPose', () => {
  it('round-trips a body arm bit-exact', () => {
    expect(decodeFramedPose(encodeFramedPose(EVEREST_ARM))).toEqual(EVEREST_ARM);
  });

  it('round-trips a site arm bit-exact', () => {
    expect(decodeFramedPose(encodeFramedPose(SITE_ARM))).toEqual(SITE_ARM);
  });

  it('round-trips a world arm bit-exact', () => {
    expect(decodeFramedPose(encodeFramedPose(WORLD_ARM))).toEqual(WORLD_ARM);
  });

  it('rejects an unrecognised tag', () => {
    expect(decodeFramedPose('x,1,2,3')).toBeNull();
  });

  it('rejects a body arm with the wrong field count', () => {
    expect(decodeFramedPose('b,earth,0,0,0')).toBeNull();
  });

  it('rejects a body id no body source seeds, a star id included', () => {
    const junk = encodeFramedPose(EVEREST_ARM).replace('earth', 'not-a-body');
    expect(decodeFramedPose(junk)).toBeNull();
    // A star is not a body id any more (spec §6): a hand-edited `#pose=b,sirius`
    // names no frame the body-state table can put the camera in.
    expect(decodeFramedPose(encodeFramedPose(EVEREST_ARM).replace('earth', 'sirius'))).toBeNull();
  });

  it('rejects a site id outside SURFACE_FIXED_SITES', () => {
    const junk = encodeFramedPose(SITE_ARM).replace('curiosity', 'not-a-site');
    expect(decodeFramedPose(junk)).toBeNull();
  });

  it('rejects a non-finite number in a world arm', () => {
    expect(decodeFramedPose('a,1,2,3,NaN,-0.2,5.5,0')).toBeNull();
  });

  it('rejects a world arm with the wrong field count', () => {
    expect(decodeFramedPose('a,1,2,3,0.7,-0.2,5.5')).toBeNull();
  });

  it('rejects an empty value', () => {
    expect(decodeFramedPose('')).toBeNull();
  });

  it('rejects a world arm with empty fields rather than reading them as 0', () => {
    // `Number('')` is 0, so a naive parse would accept this as a degenerate
    // but "valid" pose sitting at the origin with zero distance.
    expect(decodeFramedPose('a,1,2,3,,,,')).toBeNull();
  });

  it('rejects a site arm with a negative range', () => {
    expect(decodeFramedPose('s,curiosity,1.2,0.3,-12.5')).toBeNull();
  });

  it('rejects a world arm with zero distance', () => {
    expect(decodeFramedPose('a,1,2,3,0.7,-0.2,0,0')).toBeNull();
  });
});
