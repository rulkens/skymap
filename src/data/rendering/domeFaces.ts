/**
 * domeFaces — the five dome faces' (right, up, forward) columns, in DOME
 * coordinates (+x right, +y zenith, +z front). `domeFaceRotations` left-
 * multiplies each by `domeBasis` to get a `ViewSpec.rotation`. No bottom
 * face: for θ ≤ 90° it never wins `domeFaceUv`'s argmax.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import { mat3FromColumns } from '../../utils/math/mat3FromColumns';

export const DOME_FACE_COUNT = 5;

// front: right +x, up +y, forward +z; left: right +z, up +y, forward -x;
// right: right -z, up +y, forward +x; back: right -x, up +y, forward -z;
// top: right +x, up -z, forward +y — same index order as `DOME_FACES` below.
export const DOME_FACE_NAMES = ['front', 'left', 'right', 'back', 'top'] as const;

export const DOME_FACES: readonly Mat3[] = [
  mat3FromColumns([1, 0, 0], [0, 1, 0], [0, 0, 1]),
  mat3FromColumns([0, 0, 1], [0, 1, 0], [-1, 0, 0]),
  mat3FromColumns([0, 0, -1], [0, 1, 0], [1, 0, 0]),
  mat3FromColumns([-1, 0, 0], [0, 1, 0], [0, 0, -1]),
  mat3FromColumns([1, 0, 0], [0, 0, -1], [0, 1, 0]),
];
