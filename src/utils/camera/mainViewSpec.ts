/**
 * mainViewSpec — the frame's own view of its camera: no turn, no eye offset,
 * the camera's own frustum. Identity rotation and a zero offset are exact in
 * floating point, so the canvas view goes through `deriveView` like every
 * other view and still derives the pre-rig numbers bit for bit.
 */

import type { OrbitCamera } from '../../@types/camera/OrbitCamera';
import type { Size } from '../../@types/rendering/Size';
import type { Mat3 } from '../../@types/math/Mat3';
import type { ViewSpec } from '../../@types/engine/frame/ViewSpec';
import { symmetricFrustum } from './symmetricFrustum';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mainViewSpec(cam: OrbitCamera, sizePx: Size): ViewSpec {
  return {
    rotation: IDENTITY,
    eyeOffsetMpc: [0, 0, 0],
    frustum: symmetricFrustum(cam.fovYRad, cam.aspect),
    sizePx,
    slot: 0,
    kind: 'frame',
  };
}
