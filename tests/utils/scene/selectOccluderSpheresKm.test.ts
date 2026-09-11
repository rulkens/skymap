/**
 * selectOccluderSpheresKm — how the frame's opaque bodies pack, and which
 * survive a capacity squeeze. The eye sits off the origin so an absolute (not
 * eye-relative) centre fails.
 */

import { describe, expect, it } from 'vitest';

import { selectOccluderSpheresKm } from '../../../src/utils/scene/selectOccluderSpheresKm';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const KM = SCALE_UNITS.KM_TO_MPC;
const eye: Vec3 = [5 * KM, 0, 0];

function occluder(radiusKm: number, distanceKm: number) {
  return {
    positionMpc: [(5 + distanceKm) * KM, 0, 0] as Vec3,
    radiusM: radiusKm * SCALE_UNITS.KM_TO_M,
  };
}

describe('selectOccluderSpheresKm', () => {
  it('packs each sphere eye-relative in km', () => {
    const out = new Float32Array(4 * 4);
    const count = selectOccluderSpheresKm({ occluders: [occluder(50, 1000)], camPosMpc: eye }, out);
    expect(count).toBe(1);
    expect(out[0]).toBeCloseTo(1000, 2);
    expect(out[1]).toBeCloseTo(0, 2);
    expect(out[2]).toBeCloseTo(0, 2);
    expect(out[3]).toBeCloseTo(50, 2);
  });

  it('over capacity, the widest on screen win — angular size, not radius', () => {
    const out = new Float32Array(4 * 1);
    // The bigger sphere is far enough away to subtend LESS than the small one:
    // a radius-only rank would keep the wrong body.
    const count = selectOccluderSpheresKm(
      { occluders: [occluder(500, 1e6), occluder(50, 1000)], camPosMpc: eye },
      out,
    );
    expect(count).toBe(1);
    expect(out[3]).toBeCloseTo(50, 2);
  });
});
