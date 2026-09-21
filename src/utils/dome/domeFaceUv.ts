/**
 * domeFaceUv — dome-space direction → the face that renders it plus its uv
 * on that face. `face` is the argmax over `DOME_FACES` of `d·forward`, ties
 * going to the lower layer (`>`, not `>=`, keeps the first max found).
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { Mat3 } from '../../@types/math/Mat3';
import { DOME_FACES } from '../../data/rendering/domeFaces';
import { dot3 } from '../math/dot3';

/** A face's (right, up, forward) columns, per the column-major `Mat3` layout. */
function faceAxes(face: Readonly<Mat3>): {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
} {
  return {
    right: [face[0], face[1], face[2]],
    up: [face[3], face[4], face[5]],
    forward: [face[6], face[7], face[8]],
  };
}

export function domeFaceUv(dir: Readonly<Vec3>): {
  readonly face: number;
  readonly u: number;
  readonly v: number;
} {
  let bestFace = 0;
  let bestForward = -Infinity;
  for (let i = 0; i < DOME_FACES.length; i++) {
    const forward = dot3(dir, faceAxes(DOME_FACES[i]!).forward);
    if (forward > bestForward) {
      bestForward = forward;
      bestFace = i;
    }
  }
  const { right, up, forward } = faceAxes(DOME_FACES[bestFace]!);
  const s = dot3(dir, right) / dot3(dir, forward);
  const t = dot3(dir, up) / dot3(dir, forward);
  return { face: bestFace, u: (s + 1) / 2, v: (1 - t) / 2 };
}
