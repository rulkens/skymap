import { describe, expect, it } from 'vitest';
import type { OutputProjection } from '../../../src/@types/rendering/OutputProjection';
import type { ProjectedLabel } from '../../../src/@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import { symmetricFrustum } from '../../../src/utils/camera/frustum/symmetricFrustum';
import { projectLabel } from '../../../src/utils/labels/projectLabel';
import { unprojectLabel } from '../../../src/utils/labels/unprojectLabel';
import { equidistantFixture } from '../../helpers/labels/equidistantFixture';
import { pinholeFixture } from '../../helpers/labels/pinholeFixture';

const pinhole = pinholeFixture({
  eye: [0, 0, 0],
  forward: [0, 0, -1],
  up: [0, 1, 0],
  frustum: symmetricFrustum(Math.PI / 3, 1600 / 900),
  sizePx: [1600, 900],
}).output;

function roundTrip(dir: Vec3, p: OutputProjection): Vec3 {
  const len = Math.hypot(...dir);
  const projected: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };
  projectLabel(dir, p, projected);
  const back: Vec3 = [0, 0, 0];
  unprojectLabel(projected.px, p, back);
  return [back[0] - dir[0] / len, back[1] - dir[1] / len, back[2] - dir[2] / len];
}

describe('unprojectLabel', () => {
  it('unprojectLabel inverts projectLabel', () => {
    const cases: [OutputProjection, Vec3[]][] = [
      [
        pinhole,
        [
          [0, 0, 1],
          [0.4, -0.2, 1],
          [-0.9, 0.5, 2],
        ],
      ],
      // The zenith, a general direction, and one on the horizon of a wide canvas.
      [
        equidistantFixture(2000, 1000),
        [
          [0, 3, 0],
          [0.3, 0.2, -0.9],
          [-1, 0, 1],
        ],
      ],
    ];
    for (const [p, dirs] of cases) {
      for (const dir of dirs) {
        for (const error of roundTrip(dir, p)) expect(Math.abs(error)).toBeLessThan(1e-9);
      }
    }
  });
});
