/**
 * cubeFaceBases — the six cube faces' axes, in the two forms the capture path
 * needs: world-space bases (`cubemapFaceContext`'s cube-view bind) and the
 * `ViewSpec` rotations `faceViewSpec` hands `deriveView`.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { mat3FromColumns } from '../../utils/math/mat3FromColumns';
import { cross3 } from '../../utils/math/cross3';

/**
 * Forward axis per `CubeFace` (±X/±Y/±Z) and the `texture_cube` convention's
 * per-face up — the ±Y faces borrow world ±Z. The cube-view bind relies on both.
 */
export const FACE_FORWARD: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
export const FACE_UP: readonly Vec3[] = [
  [0, -1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0, -1, 0],
  [0, -1, 0],
];

/**
 * One basis per face, serving as both `poseBasis` and `upBasis` so the two cannot
 * drift. `updatePosition` decodes local +Z through the THIRD column, so that column
 * is `-forward`; `frameUp` reads the MIDDLE for screen-up, so it carries `FACE_UP`.
 */
export const FACE_BASES: readonly Mat3[] = FACE_FORWARD.map((forward, i): Mat3 => {
  const up = FACE_UP[i]!;
  const back: Vec3 = [-forward[0], -forward[1], -forward[2]];
  return mat3FromColumns(cross3(up, back), up, back);
});

/**
 * A face's right | up | forward as columns, expressed in the CAPTURE CAMERA's
 * own image-plane basis — what a `ViewSpec.rotation` means. The capture camera
 * looks along its axes' −Z with +Y up, so its basis is the axes' with the third
 * axis flipped; expressing a face axis in it therefore negates that axis's
 * z component. Independent of the capture's `axes` (they cancel), and every
 * entry is 0/±1, so the product with any camera basis is exact.
 */
export const FACE_VIEW_ROTATIONS: readonly Mat3[] = FACE_FORWARD.map((forward, i): Mat3 => {
  const up = FACE_UP[i]!;
  const flipZ = (v: Readonly<Vec3>): Vec3 => [v[0], v[1], -v[2]];
  return mat3FromColumns(flipZ(cross3(forward, up)), flipZ(up), flipZ(forward));
});
