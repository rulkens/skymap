/**
 * mainViewSpec — the frame's own view of its camera: no turn, no eye offset,
 * the camera's own frustum. Identity rotation and a zero offset are exact in
 * floating point, so the canvas view goes through `deriveView` like every
 * other view and still derives the pre-rig numbers bit for bit.
 */

import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Size } from '../../@types/rendering/Size';
import type { ViewSpec } from '../../@types/engine/frame/ViewSpec';
import { IDENTITY_MAT3 } from '../math/identityMat3';
import { symmetricFrustum } from './symmetricFrustum';

export function mainViewSpec(cam: OrbitCamera, sizePx: Size): ViewSpec {
  return {
    id: 'canvas',
    rotation: IDENTITY_MAT3,
    eyeOffsetMpc: [0, 0, 0],
    frustum: symmetricFrustum(cam.fovYRad, cam.aspect),
    sizePx,
    slot: 0,
    kind: 'frame',
  };
}
