import { describe, expect, it } from 'vitest';
import type { ProjectedLabel } from '../../../src/@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { symmetricFrustum } from '../../../src/utils/camera/frustum/symmetricFrustum';
import { liftedAnchor } from '../../../src/utils/labels/liftedAnchor';
import { tangentToward } from '../../../src/utils/labels/tangentToward';
import { pinholeFixture } from '../../helpers/labels/pinholeFixture';

describe('tangentToward', () => {
  it('tangentToward falls back to image-up when the direction is parallel to up3', () => {
    const tangent: Vec3 = [9, 9, 9];
    expect(tangentToward([0, 0, 1], [0, 0, 1], tangent)).toBe(false);
    expect(tangent).toEqual([0, 0, 0]);

    // A lift direction along the view axis: an anchor dead ahead has no great
    // circle toward it, so liftedAnchor moves the angular lift up the screen.
    const { output } = pinholeFixture({
      eye: [0, 0, 0],
      forward: [0, 0, -1],
      up: [0, 1, 0],
      frustum: symmetricFrustum(Math.PI / 3, 1600 / 900),
      sizePx: [1600, 900],
    });
    const out: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };
    liftedAnchor([0, 0, 5], 0.05, { radii: 1, minPx: 0 }, { ...output, up3: [0, 0, 1] }, out);
    expect(out.px[0]).toBeCloseTo(output.centrePx[0], 9);
    expect(out.px[1]).toBeCloseTo(output.centrePx[1] - Math.asin(0.01) * output.focalPx, 9);
  });
});
