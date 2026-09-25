import { describe, it, expect, vi } from 'vitest';

// The rover ids are carried over unmocked (meshGroundUpSource throws if a
// meshKey's bodies split seated/floating, and 'mer' backs both spirit and
// opportunity). hubble's real site membership is none (it floats); this mock
// gives it an `anchored` site instead, so the assertion below exercises the
// seat check rather than degenerating into "not seated at all".
vi.mock('../../../../src/data/bodies/surfaceFixedSites', () => ({
  SURFACE_FIXED_SITES: [
    { id: 'curiosity', hostId: 'mars', latDeg: 0, lonDeg: 0, altitudeM: 0, seat: 'resting' },
    { id: 'perseverance', hostId: 'mars', latDeg: 0, lonDeg: 0, altitudeM: 0, seat: 'resting' },
    { id: 'spirit', hostId: 'mars', latDeg: 0, lonDeg: 0, altitudeM: 0, seat: 'resting' },
    { id: 'opportunity', hostId: 'mars', latDeg: 0, lonDeg: 0, altitudeM: 0, seat: 'resting' },
    { id: 'hubble', hostId: 'earth', latDeg: 0, lonDeg: 0, altitudeM: 0, seat: 'anchored' },
  ],
}));

import { meshGroundUpSource } from '../../../../tools/utils/meshes/meshGroundUpSource';

describe('meshGroundUpSource', () => {
  it('the rovers bake against a ground whose up is source +Y', () => {
    for (const key of ['curiosity', 'perseverance', 'mer']) {
      const up = meshGroundUpSource(key);
      expect(up).toBeDefined();
      const [x, y, z] = up as [number, number, number];
      expect(x).toBeCloseTo(0);
      expect(y).toBeCloseTo(1);
      expect(z).toBeCloseTo(0);
    }
  });

  it('a floating mesh bakes with no ground', () => {
    for (const key of ['voyager']) {
      expect(meshGroundUpSource(key)).toBeUndefined();
    }
  });

  it('an anchored site is not seated (no ground-fit, no prebake)', () => {
    expect(meshGroundUpSource('hubble')).toBeUndefined();
  });
});
