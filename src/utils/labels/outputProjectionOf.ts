/**
 * outputProjectionOf — the `OutputProjection` a rig's labels land through for
 * one frame view. Pinhole: the view camera's lookAt rotation (built exactly as
 * `computeViewProj` builds it, so it agrees with `view.vp`), the eye split into
 * an f32 hi/lo pair, and the frustum's principal point and focal length. Authored
 * px are CSS px, so `pxScale` is the view's device pixel ratio. Equidistant: that
 * rotation turned into the dome frame by the basis the dome faces are built from,
 * with sizes set by the canvas's short side (positions follow the resample: `projectLabel`).
 */

import { mat4d } from 'wgpu-matrix';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { ViewRig } from '../../@types/engine/frame/ViewRig';
import type { OutputProjection } from '../../@types/rendering/OutputProjection';
import type { ImagePlaneBasis } from '../../@types/camera/pose/ImagePlaneBasis';
import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';
import { DOME_LABEL_SCALE } from '../../data/labels/domeLabelScale';
import { REFERENCE_PX_PER_RAD } from '../../data/labels/referencePxPerRad';
import { DOME_PARAMS } from '../../data/rendering/domeParams';
import { frameUp } from '../camera/orbitPose/frameUp';
import { imagePlaneBasis } from '../camera/orbitPose/imagePlaneBasis';
import { orbitForwardOf } from '../camera/orbitPose/orbitForwardOf';
import { domeBasis } from '../dome/domeBasis';
import { writeHiLoVertex } from '../math/writeHiLoVertex';

const forward: Vec3 = [0, 0, 0];
const upRef: Vec3 = [0, 0, 0];
const basis: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };
const hiLo = new Float32Array(6);
// Camera-from-dome, the same basis `domeFaceRotations` turns the faces by.
const DOME_BASIS = domeBasis(DOME_PARAMS.tiltDeg);

export function outputProjectionOf(view: FrameView, rig: ViewRig): OutputProjection {
  const kind = rig.outputProjection;
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
  const camHi: Vec3 = [hiLo[0]!, hiLo[1]!, hiLo[2]!];
  const camLo: Vec3 = [hiLo[3]!, hiLo[4]!, hiLo[5]!];
  if (kind === 'equidistant') {
    // Dome-from-world = (camera-from-dome)ᵀ · camera-from-world.
    const domeFromWorld = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3;
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < 3; r++)
        for (let k = 0; k < 3; k++)
          domeFromWorld[c * 3 + r]! += DOME_BASIS[r * 3 + k]! * viewFromWorld[c * 3 + k]!;
    const focalPx = Math.min(canvasSize.width, canvasSize.height) / Math.PI;
    return {
      kind,
      viewFromWorld: domeFromWorld,
      camHi,
      camLo,
      up3: [0, 1, 0],
      sizePx: [canvasSize.width, canvasSize.height],
      centrePx: [canvasSize.width / 2, canvasSize.height / 2],
      focalPx,
      pxScale: (focalPx / REFERENCE_PX_PER_RAD) * DOME_LABEL_SCALE,
    };
  }
  const width = frustum.tanRight - frustum.tanLeft;
  return {
    kind,
    viewFromWorld,
    camHi,
    camLo,
    up3: [0, 1, 0],
    sizePx: [canvasSize.width, canvasSize.height],
    centrePx: [(-frustum.tanLeft * canvasSize.width) / width, frustum.tanUp * view.drawPxPerRad],
    focalPx: view.drawPxPerRad,
    pxScale: view.dpr,
  };
}
