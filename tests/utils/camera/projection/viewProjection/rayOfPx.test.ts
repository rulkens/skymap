/**
 * The projection pair: each arm must agree with the pinhole and fisheye maths it
 * dispatches to (a wrong pixel convention would misplace every border number and
 * ornament), and `pxOfRay` must invert `rayOfPx` on both.
 */
import { describe, expect, it } from 'vitest';
import type { ViewProjection } from '../../../../../src/@types/camera/projection/ViewProjection';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { rayOfPx } from '../../../../../src/utils/camera/projection/viewProjection/rayOfPx';
import { pxOfRay } from '../../../../../src/utils/camera/projection/viewProjection/pxOfRay';
import { rayThroughPx } from '../../../../../src/utils/camera/projection/rayThroughPx';
import { projectDirToPx } from '../../../../../src/utils/camera/projection/projectDirToPx';
import { fisheyeDirection } from '../../../../../src/utils/dome/fisheyeDirection';
import { directionToFisheye } from '../../../../../src/utils/dome/directionToFisheye';
import { mat3FromColumns } from '../../../../../src/utils/math/mat3FromColumns';
import { normalize3 } from '../../../../../src/utils/math/normalize3';
import { cross3 } from '../../../../../src/utils/math/cross3';
import { rotateVec3ByTightMat3 } from '../../../../../src/utils/math/rotateVec3ByTightMat3';
import { rotateByTranspose } from '../../../../../src/utils/math/rotateByTranspose';

// A tilted, rolled basis and a lens-shifted frustum, so no axis or symmetry hides a sign.
const forward = normalize3([0.3, -0.5, 0.81]);
const right = normalize3(cross3(forward, [0.2, 0.9, 0.1]));
const up = cross3(right, forward);
const size = { width: 1600, height: 900 };
const rect: ViewProjection = {
  kind: 'rectilinear',
  basis: { forward, right, up },
  frustum: { tanLeft: -0.62, tanRight: 0.7, tanDown: -0.35, tanUp: 0.41 },
  size,
};
const fisheye: ViewProjection = {
  kind: 'fisheye',
  basis: mat3FromColumns(right, up, cross3(right, up)),
  centrePx: [820, 450],
  radiusPx: 430,
  size,
};
const PIXELS: Vec2[] = [
  [0, 0],
  [1600, 900],
  [811, 437],
  [500, 650],
  [1050, 200],
];

const near = (a: readonly number[], b: readonly number[], digits: number) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

describe('rayOfPx / pxOfRay — rectilinear arm', () => {
  it('is rayThroughPx and projectDirToPx', () => {
    for (const px of PIXELS) {
      const { basis, frustum } = rect as Extract<ViewProjection, { kind: 'rectilinear' }>;
      expect(rayOfPx(rect, px)).toEqual(rayThroughPx(px, basis, frustum, size));
      const dir = normalize3(rayThroughPx(px, basis, frustum, size));
      const at = projectDirToPx(dir, basis, frustum, size)!;
      expect(pxOfRay(rect, dir)).toEqual([at.x, at.y]);
    }
  });

  it('round-trips pixel → ray → pixel, and is null behind the eye', () => {
    for (const px of PIXELS) near(pxOfRay(rect, normalize3(rayOfPx(rect, px)!))!, px, 9);
    expect(pxOfRay(rect, [-forward[0], -forward[1], -forward[2]])).toBeNull();
  });
});

describe('rayOfPx / pxOfRay — fisheye arm', () => {
  const ndcOf = (px: Vec2): Vec2 => [(px[0] - 820) / 430, (450 - px[1]) / 430];
  const basis = (fisheye as Extract<ViewProjection, { kind: 'fisheye' }>).basis;

  it('is fisheyeDirection and directionToFisheye through the dome basis, y down', () => {
    for (const px of PIXELS.slice(2)) {
      const dome = fisheyeDirection(...ndcOf(px))!;
      near(rayOfPx(fisheye, px)!, rotateVec3ByTightMat3(basis, dome), 12);
      const ndc = directionToFisheye(rotateByTranspose(basis, rayOfPx(fisheye, px)!));
      near(pxOfRay(fisheye, rayOfPx(fisheye, px)!)!, [820 + ndc[0] * 430, 450 - ndc[1] * 430], 9);
    }
    // The bottom of the disc is the dome's front.
    near(rayOfPx(fisheye, [820, 880])!, cross3(right, up), 12);
  });

  it('round-trips inside the disc and is null outside it', () => {
    for (const px of PIXELS.slice(2)) near(pxOfRay(fisheye, rayOfPx(fisheye, px)!)!, px, 9);
    expect(rayOfPx(fisheye, [0, 0])).toBeNull();
    const below: Vec3 = [-up[0], -up[1], -up[2]];
    expect(pxOfRay(fisheye, below)).toBeNull();
  });
});
