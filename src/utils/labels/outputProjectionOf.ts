/**
 * outputProjectionOf — the `OutputProjection` a rig's labels land through for
 * one frame view. Pinhole: the view camera's lookAt rotation (built exactly as
 * `computeViewProj` builds it, so it agrees with `view.vp`), the eye split into
 * an f32 hi/lo pair, and the frustum's principal point and focal length. Authored
 * px are CSS px, so `pxScale` is the view's device pixel ratio.
 */

import { mat4d } from 'wgpu-matrix';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { ViewRig } from '../../@types/engine/frame/ViewRig';
import type { OutputProjection } from '../../@types/rendering/OutputProjection';
import type { ImagePlaneBasis } from '../../@types/camera/pose/ImagePlaneBasis';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { frameUp } from '../camera/orbitPose/frameUp';
import { imagePlaneBasis } from '../camera/orbitPose/imagePlaneBasis';
import { orbitForwardOf } from '../camera/orbitPose/orbitForwardOf';
import { writeHiLoVertex } from '../math/writeHiLoVertex';

const forward: Vec3 = [0, 0, 0];
const upRef: Vec3 = [0, 0, 0];
const basis: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };
const hiLo = new Float32Array(6);

export function outputProjectionOf(view: FrameView, rig: ViewRig): OutputProjection {
  // A rig naming none (the dome, until its labels PR) keeps the canvas pinhole.
  const kind = rig.outputProjection ?? 'pinhole';
  const { cam, drawCamPos: eye, frustum, canvasSize } = view;

  orbitForwardOf(cam, forward);
  imagePlaneBasis(forward, cam.roll ?? 0, frameUp(cam.upBasis, upRef), basis);
  const aim: Vec3 = [eye[0] + forward[0], eye[1] + forward[1], eye[2] + forward[2]];
  const lookAt = mat4d.lookAt(eye, aim, basis.rolledUp);
  // lookAt looks down −z; view space here looks down +z, so its third row flips.
  const viewFromWorld = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3;
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 3; r++) viewFromWorld[c * 3 + r] = (r === 2 ? -1 : 1) * lookAt[c * 4 + r]!;

  writeHiLoVertex(eye, 0, hiLo, 0);
  const width = frustum.tanRight - frustum.tanLeft;
  return {
    kind,
    viewFromWorld,
    camHi: [hiLo[0]!, hiLo[1]!, hiLo[2]!],
    camLo: [hiLo[3]!, hiLo[4]!, hiLo[5]!],
    up3: [0, 1, 0],
    sizePx: [canvasSize.width, canvasSize.height],
    centrePx: [(-frustum.tanLeft * canvasSize.width) / width, frustum.tanUp * view.drawPxPerRad],
    focalPx: view.drawPxPerRad,
    pxScale: view.pxPerCssPx,
  };
}
