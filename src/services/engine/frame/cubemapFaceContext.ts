/**
 * cubemapFaceContext — one face of a cubemap capture's frame, turned through
 * `faceViewSpec` and flipped for WebGPU's top-left origin. The frame itself
 * (the synthetic camera, once per capture row) is `cubemapCaptureFrame`.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import { faceViewSpec } from '../../../utils/camera/faceViewSpec';
import { deriveView } from './deriveView';

/**
 * Negate a vp's clip-Y row (column-major 1/5/9/13). The cube-face basis table
 * is the GL capture convention, upright only under GL's bottom-left origin;
 * WebGPU rasterizes top-left, so every face would sample flipped (v = 1 − t)
 * and no rotation absorbs a reflection. The winding reversal is harmless here.
 */
function flipClipY(vp: Float32Array | Float64Array): void {
  vp[1] = -vp[1]!;
  vp[5] = -vp[5]!;
  vp[9] = -vp[9]!;
  vp[13] = -vp[13]!;
}

export function cubemapFaceContext(
  snapshot: ReadyFrameContext,
  face: CubeFace,
  faceSizePx: number,
  viewSlotBase: number,
): FrameView {
  const view = deriveView(snapshot, faceViewSpec(face, faceSizePx, viewSlotBase));
  // In place is safe: `deriveView` freshly allocated these arrays.
  flipClipY(view.vp);
  for (const slab of view.slabs) flipClipY(slab.vp);
  return view;
}
