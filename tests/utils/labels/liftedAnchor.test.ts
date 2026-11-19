import { describe, expect, it } from 'vitest';
import type { ProjectedLabel } from '../../../src/@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { symmetricFrustum } from '../../../src/utils/camera/frustum/symmetricFrustum';
import { liftedAnchor } from '../../../src/utils/labels/liftedAnchor';
import { projectLabel } from '../../../src/utils/labels/projectLabel';
import { equidistantFixture } from '../../helpers/labels/equidistantFixture';
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

describe('liftedAnchor, equidistant', () => {
  const dome = { ...equidistantFixture(2000), pxScale: 2 };

  it('a lifted label sits nearer the zenith than its subject', () => {
    const v: Vec3 = [0, 1, 1];
    const subject = fresh();
    const anchor = fresh();
    projectLabel(v, dome, subject);
    // One angular radius of 2°, lifted by one radius.
    const radius = Math.SQRT2 * Math.sin((2 * Math.PI) / 180);
    liftedAnchor(v, radius, { radii: 1, minPx: 0 }, dome, anchor);
    expect(anchor.px[0]).toBeCloseTo(subject.px[0], 9);
    expect(subject.px[1] - anchor.px[1]).toBeCloseTo((2000 / 180) * 2, 6);
  });

  it('the pixel floor pushes along the local up', () => {
    const anchor = fresh();
    liftedAnchor([1, 0, 0], 0, { radii: 3, minPx: 20 }, dome, anchor);
    expect(anchor.visible).toBe(true);
    expect(anchor.px[0]).toBeCloseTo(2000 - 20 * dome.pxScale, 9);
    expect(anchor.px[1]).toBeCloseTo(1000, 9);
  });

  it('a subject at the zenith lifts toward image-up', () => {
    const anchor = fresh();
    liftedAnchor([0, 5, 0], 0.5, { radii: 2, minPx: 0 }, dome, anchor);
    expect(anchor.px[0]).toBeCloseTo(1000, 9);
    expect(anchor.px[1]).toBeCloseTo(1000 - 2 * Math.asin(0.1) * (2000 / Math.PI), 6);
  });
});
