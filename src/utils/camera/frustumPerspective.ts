/**
 * frustumPerspective — the f32 [0,1]-depth projection `computeViewProj` uploads.
 * One f64→f32 rounding per element, the same single rounding `mat4.perspective`
 * does when it writes its f64 expressions into a Float32Array.
 */

import type { Mat4 } from 'wgpu-matrix';
import type { ViewFrustum } from '../../@types/camera/ViewFrustum';
import { frustumPerspectiveF64 } from './frustumPerspectiveF64';

export function frustumPerspective(
  frustum: ViewFrustum,
  near: number,
  far: number,
  clipYFlip?: boolean,
): Mat4 {
  return Float32Array.from(frustumPerspectiveF64(frustum, near, far, clipYFlip));
}
