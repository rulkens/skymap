/**
 * mainViewSpec — the frame's own view of its camera: no turn, no eye offset,
 * and the camera runtime's frustum (`FrameOutputs.frustum`), which draw and
 * pick both pass so the two can never disagree. Identity rotation and a zero
 * offset are exact in floating point, so the canvas view goes through
 * `deriveView` like every other view and still derives the pre-rig numbers.
 */

import type { Size } from '../../../@types/rendering/Size';
import type { ViewSpec } from '../../../@types/engine/frame/ViewSpec';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import { IDENTITY_MAT3 } from '../../math/identityMat3';

export function mainViewSpec(sizePx: Size, frustum: ViewFrustum): ViewSpec {
  return {
    id: 'canvas',
    rotation: IDENTITY_MAT3,
    eyeOffsetMpc: [0, 0, 0],
    frustum,
    sizePx,
    slot: 0,
    kind: 'frame',
  };
}
