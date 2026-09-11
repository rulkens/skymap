/**
 * selectOccluderSpheresKm — which bodies become occluders and how they pack.
 * Fixture: three bodies at equal distance with different radii, so their
 * on-screen order is their radius order; the eye sits off the origin so an
 * absolute (not eye-relative) centre fails.
 */

import { describe, expect, it } from 'vitest';

import { selectOccluderSpheresKm } from '../../../src/utils/scene/selectOccluderSpheresKm';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { SceneBody } from '../../../src/@types/scene/SceneBody';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const KM = SCALE_UNITS.KM_TO_MPC;
const eye: Vec3 = [5 * KM, 0, 0];

function body(id: string, radiusKm: number): SceneBody {
  return { id, label: id, radiusM: radiusKm * SCALE_UNITS.KM_TO_M } as unknown as SceneBody;
}
function state(positionMpc: Vec3): BodyState {
  return { positionMpc, orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1], meanAnomalyRad: 0 };
}

// All three sit 1000 km from the eye, along +x.
const bodies = [body('small', 0.1), body('big', 50), body('mid', 10)];
const bodyStates = new Map<string, BodyState>([
  ['small', state([1005 * KM, 0, 0])],
  ['big', state([1005 * KM, 0, 0])],
  ['mid', state([1005 * KM, 0, 0])],
  ['stateless', state([1005 * KM, 0, 0])],
]);
const view = { camPosMpc: eye, viewportHeightPx: 1000, fovYRad: 1 };

describe('selectOccluderSpheresKm', () => {
  it('keeps only bodies that resolve on screen, packed eye-relative in km', () => {
    const out = new Float32Array(4 * 4);
    // 0.1 km radius at 1000 km is ~0.2 px tall: below the 1 px floor.
    const count = selectOccluderSpheresKm({ ...view, bodies, bodyStates, minDiameterPx: 1 }, out);
    expect(count).toBe(2);
    const ids = [out[3], out[7]].map((r) => r! / 1); // radii in km identify the bodies
    expect(ids.sort((a, b) => a - b)).toEqual([10, 50]);
    expect(out[0]).toBeCloseTo(1000, 2);
    expect(out[1]).toBeCloseTo(0, 2);
  });

  it('over capacity, the largest on screen win', () => {
    const out = new Float32Array(4 * 1);
    const count = selectOccluderSpheresKm({ ...view, bodies, bodyStates, minDiameterPx: 0 }, out);
    expect(count).toBe(1);
    expect(out[3]).toBe(50);
  });

  it('skips a body with no state this frame', () => {
    const out = new Float32Array(4 * 4);
    const count = selectOccluderSpheresKm(
      { ...view, bodies: [body('ghost', 50)], bodyStates, minDiameterPx: 0 },
      out,
    );
    expect(count).toBe(0);
  });
});
