/**
 * pxPerRadAt sizes ornaments and picks the ruling interval: it must match the
 * pixel step a small tangential turn actually makes through `pxOfRay`, off axis
 * as well as at the centre, on both arms.
 */
import { describe, expect, it } from 'vitest';
import type { ViewProjection } from '../../../../src/@types/camera/projection/ViewProjection';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { pxPerRadAt } from '../../../../src/utils/camera/projection/pxPerRadAt';
import { pxOfRay } from '../../../../src/utils/camera/projection/pxOfRay';
import { mat3FromColumns } from '../../../../src/utils/math/mat3FromColumns';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { cross3 } from '../../../../src/utils/math/cross3';

const forward = normalize3([0.3, -0.5, 0.81]);
const right = normalize3(cross3(forward, [0.2, 0.9, 0.1]));
const up = cross3(right, forward);
const size = { width: 1600, height: 900 };
const EPS = 1e-6;

function measured(proj: ViewProjection, dir: Vec3, axis: Readonly<Vec3>): number {
  const e = normalize3(cross3(axis, dir));
  const a = pxOfRay(proj, dir)!;
  const b = pxOfRay(
    proj,
    normalize3([dir[0] + e[0] * EPS, dir[1] + e[1] * EPS, dir[2] + e[2] * EPS]),
  )!;
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / EPS;
}

const offAxis = (axis: Readonly<Vec3>, side: Readonly<Vec3>, k: number): Vec3 =>
  normalize3([axis[0] + side[0] * k, axis[1] + side[1] * k, axis[2] + side[2] * k]);

describe('pxPerRadAt', () => {
  it('is the pinhole’s tangential px per radian, 1 / cos off axis', () => {
    const proj: ViewProjection = {
      kind: 'rectilinear',
      basis: { forward, right, up },
      // Square pixels, as every real view has: the same px per tangent both ways.
      frustum: { tanLeft: -0.62, tanRight: -0.62 + (0.76 * 16) / 9, tanDown: -0.35, tanUp: 0.41 },
      size,
    };
    for (const k of [0.05, 0.3, 0.55]) {
      const dir = offAxis(
        forward,
        normalize3([right[0] + up[0], right[1] + up[1], right[2] + up[2]]),
        k,
      );
      expect(pxPerRadAt(proj, dir)).toBeCloseTo(measured(proj, dir, forward), 2);
    }
  });

  it('is the fisheye’s tangential px per radian, θ / sin θ from the zenith', () => {
    const zenith = up;
    const proj: ViewProjection = {
      kind: 'fisheye',
      basis: mat3FromColumns(right, zenith, cross3(right, zenith)),
      centrePx: [800, 450],
      radiusPx: 450,
      size,
    };
    for (const k of [0.05, 1, 4]) {
      const dir = offAxis(zenith, forward, k);
      expect(pxPerRadAt(proj, dir)).toBeCloseTo(measured(proj, dir, zenith), 2);
    }
    expect(pxPerRadAt(proj, zenith)).toBeCloseTo(450 / (Math.PI / 2), 9);
  });
});
