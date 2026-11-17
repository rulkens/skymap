import { describe, expect, it } from 'vitest';
import type { ProjectedLabel } from '../../../src/@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { symmetricFrustum } from '../../../src/utils/camera/frustum/symmetricFrustum';
import { liftedAnchor } from '../../../src/utils/labels/liftedAnchor';
import { pinholeFixture } from '../../helpers/labels/pinholeFixture';

const camera = pinholeFixture({
  eye: [0, 0, 0],
  forward: [0, 0, -1],
  up: [0, 1, 0],
  frustum: symmetricFrustum(Math.PI / 3, 1600 / 900),
  sizePx: [1600, 900],
});
const fresh = (): ProjectedLabel => ({ px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false });

describe('liftedAnchor', () => {
  it('liftedAnchor caps the lift at 90 degrees when the eye is inside the sphere', () => {
    const v: Vec3 = [0, -0.5, 0.5]; // 45° below the axis, 0.71 from the centre
    const inside = fresh();
    const deepInside = fresh();
    liftedAnchor(v, 1, { radii: 1, minPx: 0 }, camera.output, inside);
    liftedAnchor(v, 10, { radii: 3, minPx: 0 }, camera.output, deepInside);
    // Turned a full 90° toward up: 45° above the axis.
    const { centrePx, focalPx } = camera.output;
    expect(inside.visible).toBe(true);
    expect(inside.px[0]).toBeCloseTo(centrePx[0], 9);
    expect(inside.px[1]).toBeCloseTo(centrePx[1] - focalPx, 6);
    expect(deepInside.px).toEqual(inside.px);
  });

  it('liftedAnchor lifts a small subject by its pixel floor, a large one by its radii', () => {
    const { centrePx, focalPx } = camera.output;
    const small = fresh();
    const large = fresh();
    liftedAnchor([0, 0, 1], 1e-6, { radii: 3, minPx: 28 }, camera.output, small);
    liftedAnchor([0, 0, 1], 0.05, { radii: 3, minPx: 28 }, camera.output, large);
    expect(small.px[1]).toBeCloseTo(centrePx[1] - 28, 6);
    // 3 × asin(0.05) above the axis.
    expect(large.px[1]).toBeCloseTo(centrePx[1] - focalPx * Math.tan(3 * Math.asin(0.05)), 6);
  });
});
