/**
 * A pinhole camera twice over: as the `OutputProjection` `projectLabel` reads
 * and as the f64 view-projection matrix the clip-space label path used, built
 * from the same eye, aim and frustum so a test can hold the two against each other.
 */

import { mat4d } from 'wgpu-matrix';
import type { OutputProjection } from '../../../src/@types/rendering/OutputProjection';
import type { ViewFrustum } from '../../../src/@types/camera/projection/ViewFrustum';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec2 } from '../../../packages/shared/src/@types/math/Vec2';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import { frustumPerspectiveF64 } from '../../../src/utils/camera/frustum/frustumPerspectiveF64';

export function pinholeFixture(input: {
  readonly eye: Vec3;
  readonly forward: Vec3;
  readonly up: Vec3;
  readonly frustum: ViewFrustum;
  readonly sizePx: Vec2;
}): { readonly output: OutputProjection; readonly vp: Float64Array; viewOf(p: Vec3): Vec3 } {
  const { eye, forward, up, frustum, sizePx } = input;
  const aim: Vec3 = [eye[0] + forward[0], eye[1] + forward[1], eye[2] + forward[2]];
  const view = mat4d.lookAt(eye, aim, up) as Float64Array;
  const vp = mat4d.multiply(frustumPerspectiveF64(frustum, 1e-6, 1e6), view) as Float64Array;
  // lookAt looks down −z; view space here looks down +z, so the third row flips.
  const viewFromWorld = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3;
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 3; r++) viewFromWorld[c * 3 + r] = (r === 2 ? -1 : 1) * view[c * 4 + r]!;
  const focalPx = sizePx[1] / (frustum.tanUp - frustum.tanDown);
  const output: OutputProjection = {
    kind: 'pinhole',
    viewFromWorld,
    camHi: [0, 0, 0],
    camLo: [0, 0, 0],
    up3: [0, 1, 0],
    sizePx,
    centrePx: [
      (-frustum.tanLeft * sizePx[0]) / (frustum.tanRight - frustum.tanLeft),
      frustum.tanUp * focalPx,
    ],
    focalPx,
    pxScale: 1,
  };
  const viewOf = (p: Vec3): Vec3 => {
    const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const m = viewFromWorld;
    return [
      m[0] * d[0]! + m[3] * d[1]! + m[6] * d[2]!,
      m[1] * d[0]! + m[4] * d[1]! + m[7] * d[2]!,
      m[2] * d[0]! + m[5] * d[1]! + m[8] * d[2]!,
    ];
  };
  return { output, vp, viewOf };
}
