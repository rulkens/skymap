/**
 * domeFaces — the five dome faces' (right, up, forward) columns, in DOME
 * coordinates (+x right, +y zenith, +z front). `domeFaceRotations` left-
 * multiplies each by `domeBasis` to get a `ViewSpec.rotation`. No bottom
 * face: for θ ≤ 90° it never wins `domeFaceUv`'s argmax.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import { mat3FromColumns } from '../../utils/math/mat3FromColumns';

export const DOME_FACE_COUNT = 5;

export const DOME_FACES: readonly Mat3[] = [
  // front: right +x, up +y, forward +z
  mat3FromColumns([1, 0, 0], [0, 1, 0], [0, 0, 1]),
  // left: right +z, up +y, forward -x
  mat3FromColumns([0, 0, 1], [0, 1, 0], [-1, 0, 0]),
  // right: right -z, up +y, forward +x
  mat3FromColumns([0, 0, -1], [0, 1, 0], [1, 0, 0]),
  // back: right -x, up +y, forward -z
  mat3FromColumns([-1, 0, 0], [0, 1, 0], [0, 0, -1]),
  // top: right +x, up -z, forward +y
  mat3FromColumns([1, 0, 0], [0, 0, -1], [0, 1, 0]),
];
